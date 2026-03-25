import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

const ACTIVITYWATCH_BASE_URL = new URL('http://localhost:5600')
const ACTIVITYWATCH_RETRY_MS = 5_000
const ACTIVITYWATCH_STARTUP_TIMEOUT_MS = 20_000
const ACTIVITYWATCH_STARTUP_POLL_MS = 500
const MINUTE_MS = 60_000
const EVENT_FETCH_LIMIT = 100

const AW_SERVER_NAME = 'aw-server'
const AW_WATCHER_WINDOW_NAME = 'aw-watcher-window'
const AW_WATCHER_AFK_NAME = 'aw-watcher-afk'

type ActivityWatchBucketsResponse = Record<string, unknown>

type ActivityWatchEvent<TData extends Record<string, unknown>> = {
  timestamp: string
  duration: number
  data: TData
}

type WindowEventData = {
  app?: string
  title?: string
}

type AfkEventData = {
  status?: string
}

type MinuteRecord = {
  timestamp: string
  app: string | null
  title: string | null
  dominance: number | null
  afk: boolean
}

type ProcessCheckResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error: Error | null
}

type MinuteInsertResult = {
  changes: number
  lastInsertRowid: number | bigint
}

let bucketDiscoveryTimeout: NodeJS.Timeout | null = null
let minuteStartTimeout: NodeJS.Timeout | null = null
let minuteInterval: NodeJS.Timeout | null = null
let isDiscoveringBuckets = false
let activityWatchStartupPromise: Promise<void> | null = null
let windowBucketId: string | null = null
let afkBucketId: string | null = null
let consecutiveAfkMinutes = 0
let database: Database.Database | null = null
let insertMinuteStatement: Database.Statement | null = null

let awServerProcess: ChildProcessWithoutNullStreams | null = null
let awWatcherWindowProcess: ChildProcessWithoutNullStreams | null = null
let awWatcherAfkProcess: ChildProcessWithoutNullStreams | null = null

const CREATE_MINUTES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS minutes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL UNIQUE,
    app         TEXT,
    title       TEXT,
    dominance   REAL,
    afk         INTEGER DEFAULT 0,
    needs_review INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`

const ADD_NEEDS_REVIEW_COLUMN_SQL = `
  ALTER TABLE minutes ADD COLUMN needs_review INTEGER DEFAULT 0;
`

function getActivityWatchPlatform(): string {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

function getExecutableName(binaryName: string): string {
  return process.platform === 'win32' ? `${binaryName}.exe` : binaryName
}

function resolveActivityWatchRoot(): string {
  const platformDir = getActivityWatchPlatform()
  const candidates = [
    join(process.resourcesPath, 'activitywatch', platformDir),
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'activitywatch', platformDir),
    join(app.getAppPath(), 'resources', 'activitywatch', platformDir),
    join(app.getAppPath(), '..', 'resources', 'activitywatch', platformDir),
    join(__dirname, '../../resources/activitywatch', platformDir)
  ]

  const resolved = candidates.find((candidate) => existsSync(candidate))
  if (!resolved) {
    throw new Error(`ActivityWatch binaries not found. Checked: ${candidates.join(', ')}`)
  }

  return resolved
}

function resolveBinaryPath(baseDir: string, binaryFolder: string, binaryName: string): string {
  return join(baseDir, binaryFolder, getExecutableName(binaryName))
}

function buildActivityWatchEnv(baseDir: string, binaryDir: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const separator = process.platform === 'win32' ? ';' : ':'
  const libraryPaths = [baseDir, binaryDir]

  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [libraryPaths.join(separator), process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(separator)
  }

  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = [libraryPaths.join(separator), process.env.DYLD_LIBRARY_PATH]
      .filter(Boolean)
      .join(separator)
  }

  return env
}

function attachProcessLogging(
  label: string,
  childProcess: ChildProcessWithoutNullStreams,
  onExit: () => void
): ChildProcessWithoutNullStreams {
  childProcess.stdout.on('data', (chunk) => {
    const output = chunk.toString().trim()
    if (output) console.log(`[${label}] ${output}`)
  })

  childProcess.stderr.on('data', (chunk) => {
    const output = chunk.toString().trim()
    if (output) console.error(`[${label}] ${output}`)
  })

  childProcess.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error)
  })

  childProcess.on('exit', (code, signal) => {
    console.log(`[${label}] exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`)
    onExit()
  })

  return childProcess
}

function buildActivityWatchUrl(pathname: string): URL {
  return new URL(pathname, ACTIVITYWATCH_BASE_URL)
}

function initializeDatabase(): void {
  try {
    const databasePath = join(app.getPath('userData'), 'digital_balance.db')
    database = new Database(databasePath)
    database.exec(CREATE_MINUTES_TABLE_SQL)
    try {
      database.exec(ADD_NEEDS_REVIEW_COLUMN_SQL)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('duplicate column name: needs_review')) {
        throw error
      }
    }
    insertMinuteStatement = database.prepare(`
      INSERT OR IGNORE INTO minutes (timestamp, app, title, dominance, afk, needs_review)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
  } catch (error) {
    console.error('[db] Failed to initialize database:', error)
    database = null
    insertMinuteStatement = null
  }
}

function getNeedsReview(record: MinuteRecord): boolean {
  const normalizedApp = record.app?.trim().toLowerCase() ?? null
  const normalizedTitle = record.title?.trim().toLowerCase() ?? null

  return (
    normalizedApp === 'unknown' ||
    normalizedTitle === 'unknown' ||
    record.app === '' ||
    (record.dominance !== null && record.dominance < 0.2)
  )
}

function persistMinuteRecord(record: MinuteRecord): void {
  if (!database || !insertMinuteStatement) {
    return
  }

  try {
    const needsReview = getNeedsReview(record)
    const result = insertMinuteStatement.run(
      record.timestamp,
      record.app,
      record.title,
      record.dominance,
      record.afk ? 1 : 0,
      needsReview ? 1 : 0
    ) as MinuteInsertResult

    if (result.changes === 1) {
      console.log(`[db] inserted minute ${record.timestamp} (id: ${String(result.lastInsertRowid)})`)
    }
  } catch (error) {
    console.error(`[db] Failed to insert minute ${record.timestamp}:`, error)
  }
}

function closeDatabase(): void {
  if (!database) {
    return
  }

  try {
    database.close()
  } catch (error) {
    console.error('[db] Failed to close database:', error)
  } finally {
    insertMinuteStatement = null
    database = null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runProcessCheck(command: string, args: string[]): Promise<ProcessCheckResult> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''

    const finalize = (result: ProcessCheckResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      finalize({
        stdout,
        stderr,
        exitCode: null,
        error
      })
    })

    child.on('close', (exitCode) => {
      finalize({
        stdout,
        stderr,
        exitCode,
        error: null
      })
    })
  })
}

async function isProcessRunning(processName: string): Promise<boolean> {
  if (process.platform === 'win32') {
    const imageName = getExecutableName(processName)
    const result = await runProcessCheck('tasklist', [
      '/FO',
      'CSV',
      '/NH',
      '/FI',
      `IMAGENAME eq ${imageName}`
    ])

    if (result.error) {
      console.warn(`[activitywatch] Failed to inspect process "${imageName}":`, result.error)
      return false
    }

    return result.stdout.toLowerCase().includes(`"${imageName.toLowerCase()}"`)
  }

  const pgrepResult = await runProcessCheck('pgrep', ['-x', processName])
  if (pgrepResult.exitCode === 0) {
    return pgrepResult.stdout.trim().length > 0
  }

  if (pgrepResult.exitCode === 1) {
    return false
  }

  const psResult = await runProcessCheck('ps', ['-A', '-o', 'comm='])
  if (psResult.error || psResult.exitCode !== 0) {
    console.warn(
      `[activitywatch] Failed to inspect process "${processName}":`,
      pgrepResult.error ?? psResult.error ?? new Error(psResult.stderr || 'Unknown process lookup failure')
    )
    return false
  }

  return psResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === processName)
}

async function isActivityWatchServerHealthy(timeoutMs = 1_000): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildActivityWatchUrl('/api/0/buckets'), {
      signal: controller.signal
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

async function waitForActivityWatchServerReady(): Promise<boolean> {
  const deadline = Date.now() + ACTIVITYWATCH_STARTUP_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (await isActivityWatchServerHealthy()) {
      return true
    }

    await sleep(ACTIVITYWATCH_STARTUP_POLL_MS)
  }

  return false
}

function launchManagedProcess(
  label: string,
  binaryPath: string,
  baseDir: string,
  setProcessRef: (childProcess: ChildProcessWithoutNullStreams | null) => void
): void {
  const binaryDir = dirname(binaryPath)
  const childProcess = attachProcessLogging(
    label,
    spawn(binaryPath, [], {
      cwd: binaryDir,
      env: buildActivityWatchEnv(baseDir, binaryDir),
      stdio: 'pipe',
      windowsHide: true
    }),
    () => {
      setProcessRef(null)
    }
  )

  setProcessRef(childProcess)
}

async function ensureActivityWatchServer(activityWatchRoot: string): Promise<void> {
  if (await isActivityWatchServerHealthy()) {
    console.log('[aw-server] already running, skipping launch')
    return
  }

  if (awServerProcess && awServerProcess.exitCode === null && !awServerProcess.killed) {
    const ready = await waitForActivityWatchServerReady()
    if (!ready) {
      console.error(
        `[aw-server] Timed out waiting for ActivityWatch server after ${ACTIVITYWATCH_STARTUP_TIMEOUT_MS}ms`
      )
    }
    return
  }

  if (await isProcessRunning(AW_SERVER_NAME)) {
    console.log('[aw-server] process already running, waiting for readiness')

    const ready = await waitForActivityWatchServerReady()
    if (!ready) {
      console.error(
        `[aw-server] Process detected but server stayed unreachable after ${ACTIVITYWATCH_STARTUP_TIMEOUT_MS}ms`
      )
    }

    return
  }

  const binaryPath = resolveBinaryPath(activityWatchRoot, AW_SERVER_NAME, AW_SERVER_NAME)
  if (!existsSync(binaryPath)) {
    console.error(`[aw-server] binary not found at ${binaryPath}`)
    return
  }

  launchManagedProcess('aw-server', binaryPath, activityWatchRoot, (childProcess) => {
    awServerProcess = childProcess
  })

  const ready = await waitForActivityWatchServerReady()
  if (!ready) {
    console.error(
      `[aw-server] Timed out waiting for ActivityWatch server after ${ACTIVITYWATCH_STARTUP_TIMEOUT_MS}ms`
    )
  }
}

async function ensureActivityWatchWatcher(
  activityWatchRoot: string,
  watcherName: typeof AW_WATCHER_WINDOW_NAME | typeof AW_WATCHER_AFK_NAME
): Promise<void> {
  const trackedProcess =
    watcherName === AW_WATCHER_WINDOW_NAME ? awWatcherWindowProcess : awWatcherAfkProcess

  if (trackedProcess && trackedProcess.exitCode === null && !trackedProcess.killed) {
    console.log(`[${watcherName}] already running, skipping launch`)
    return
  }

  if (await isProcessRunning(watcherName)) {
    console.log(`[${watcherName}] already running, skipping launch`)
    return
  }

  const binaryPath = resolveBinaryPath(activityWatchRoot, watcherName, watcherName)
  if (!existsSync(binaryPath)) {
    console.error(`[${watcherName}] binary not found at ${binaryPath}`)
    return
  }

  launchManagedProcess(watcherName, binaryPath, activityWatchRoot, (childProcess) => {
    if (watcherName === AW_WATCHER_WINDOW_NAME) {
      awWatcherWindowProcess = childProcess
      return
    }

    awWatcherAfkProcess = childProcess
  })
}

async function startBundledActivityWatch(): Promise<void> {
  const activityWatchRoot = resolveActivityWatchRoot()

  await ensureActivityWatchServer(activityWatchRoot)

  if (!(await isActivityWatchServerHealthy())) {
    console.warn('[activitywatch] Server unavailable after startup attempt.')
    return
  }

  await ensureActivityWatchWatcher(activityWatchRoot, AW_WATCHER_WINDOW_NAME)
  await ensureActivityWatchWatcher(activityWatchRoot, AW_WATCHER_AFK_NAME)
}

function startActivityWatchOnLaunch(): Promise<void> {
  if (!activityWatchStartupPromise) {
    activityWatchStartupPromise = startBundledActivityWatch()
      .catch((error) => {
        console.error('Failed to start ActivityWatch services:', error)
      })
      .finally(() => {
        activityWatchStartupPromise = null
      })
  }

  return activityWatchStartupPromise
}

function scheduleBucketDiscovery(delayMs = 0): void {
  if (bucketDiscoveryTimeout) {
    clearTimeout(bucketDiscoveryTimeout)
  }

  bucketDiscoveryTimeout = setTimeout(() => {
    bucketDiscoveryTimeout = null
    void discoverActivityWatchBuckets()
  }, delayMs)
}

async function fetchBuckets(): Promise<ActivityWatchBucketsResponse | null> {
  const url = buildActivityWatchUrl('/api/0/buckets')

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn('ActivityWatch not reachable')
      console.warn(`[activitywatch] /api/0/buckets returned ${response.status}`)
      return null
    }

    return (await response.json()) as ActivityWatchBucketsResponse
  } catch (error) {
    console.warn('ActivityWatch not reachable')
    console.warn('[activitywatch] Failed to fetch buckets:', error)
    return null
  }
}

function startMinuteScheduler(): void {
  if (minuteStartTimeout || minuteInterval) {
    return
  }

  const now = Date.now()
  const msUntilNext = MINUTE_MS - (now % MINUTE_MS)

  minuteStartTimeout = setTimeout(() => {
    minuteStartTimeout = null
    void tickMinute()
    minuteInterval = setInterval(() => {
      void tickMinute()
    }, MINUTE_MS)
  }, msUntilNext)
}

function stopMinuteScheduler(): void {
  if (minuteStartTimeout) {
    clearTimeout(minuteStartTimeout)
    minuteStartTimeout = null
  }

  if (minuteInterval) {
    clearInterval(minuteInterval)
    minuteInterval = null
  }
}

function restartBucketDiscovery(): void {
  windowBucketId = null
  afkBucketId = null
  consecutiveAfkMinutes = 0
  stopMinuteScheduler()
  scheduleBucketDiscovery(ACTIVITYWATCH_RETRY_MS)
}

function logMinuteRecord(record: MinuteRecord): void {
  console.log(JSON.stringify(record))
  persistMinuteRecord(record)
}

async function discoverActivityWatchBuckets(): Promise<void> {
  if (isDiscoveringBuckets) {
    return
  }

  isDiscoveringBuckets = true

  try {
    const buckets = await fetchBuckets()
    if (!buckets) {
      scheduleBucketDiscovery(ACTIVITYWATCH_RETRY_MS)
      return
    }

    const bucketIds = Object.keys(buckets)
    console.log('[activitywatch] bucket ids:', bucketIds)

    windowBucketId =
      bucketIds.find((bucketId) => bucketId.includes(AW_WATCHER_WINDOW_NAME)) ?? null
    afkBucketId = bucketIds.find((bucketId) => bucketId.includes(AW_WATCHER_AFK_NAME)) ?? null

    if (!windowBucketId || !afkBucketId) {
      const missingBuckets = [
        !windowBucketId ? AW_WATCHER_WINDOW_NAME : null,
        !afkBucketId ? AW_WATCHER_AFK_NAME : null
      ].filter((bucketName): bucketName is string => bucketName !== null)

      console.warn(
        `[activitywatch] Missing bucket(s): ${missingBuckets.join(', ')}. Retrying in 5s.`
      )

      scheduleBucketDiscovery(ACTIVITYWATCH_RETRY_MS)
      return
    }

    console.log(
      `[activitywatch] using window bucket "${windowBucketId}" and afk bucket "${afkBucketId}"`
    )

    startMinuteScheduler()
  } finally {
    isDiscoveringBuckets = false
  }
}

async function fetchBucketEvents<TData extends Record<string, unknown>>(
  bucketId: string,
  start: Date,
  end: Date
): Promise<ActivityWatchEvent<TData>[] | null> {
  const url = buildActivityWatchUrl(`/api/0/buckets/${encodeURIComponent(bucketId)}/events`)
  url.search = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: EVENT_FETCH_LIMIT.toString()
  }).toString()

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`[activitywatch] Failed to fetch events for ${bucketId}: ${response.status}`)
      return null
    }

    return (await response.json()) as ActivityWatchEvent<TData>[]
  } catch (error) {
    console.warn(`[activitywatch] Failed to fetch events for ${bucketId}:`, error)
    return null
  }
}

async function tickMinute(): Promise<void> {
  if (!windowBucketId || !afkBucketId) {
    console.warn('[activitywatch] Bucket IDs unavailable. Restarting discovery.')
    restartBucketDiscovery()
    return
  }

  const start = new Date(Math.floor(Date.now() / MINUTE_MS - 1) * MINUTE_MS)
  const end = new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)

  const [windowEvents, afkEvents] = await Promise.all([
    fetchBucketEvents<WindowEventData>(windowBucketId, start, end),
    fetchBucketEvents<AfkEventData>(afkBucketId, start, end)
  ])

  if (!windowEvents || !afkEvents) {
    console.warn('ActivityWatch not reachable')
    console.warn('[activitywatch] Minute fetch failed. Restarting bucket discovery.')
    restartBucketDiscovery()
    return
  }

  const afkDuration = afkEvents.reduce((total, event) => {
    return event.data.status === 'afk' ? total + event.duration : total
  }, 0)

  if (afkDuration > 50) {
    consecutiveAfkMinutes += 1
  } else {
    consecutiveAfkMinutes = 0
  }

  if (windowEvents.length === 0) {
    logMinuteRecord({
      timestamp: start.toISOString(),
      app: null,
      title: null,
      dominance: null,
      afk: true
    })
    return
  }

  const isAfk = consecutiveAfkMinutes >= 3

  const appTotals = new Map<
    string,
    { duration: number; latestTimestamp: number; title: string | null }
  >()

  for (const event of windowEvents) {
    const appName = event.data.app?.trim() || 'Unknown'
    const title = event.data.title?.trim() || null
    const parsedTimestamp = Date.parse(event.timestamp)
    const eventTimestamp = Number.isNaN(parsedTimestamp) ? Number.NEGATIVE_INFINITY : parsedTimestamp
    const existingEntry = appTotals.get(appName)

    if (!existingEntry) {
      appTotals.set(appName, {
        duration: event.duration,
        latestTimestamp: eventTimestamp,
        title
      })
      continue
    }

    existingEntry.duration += event.duration

    if (eventTimestamp >= existingEntry.latestTimestamp) {
      existingEntry.latestTimestamp = eventTimestamp
      existingEntry.title = title
    }
  }

  let winner:
    | { app: string; duration: number; latestTimestamp: number; title: string | null }
    | null = null

  for (const [appName, summary] of appTotals) {
    if (
      !winner ||
      summary.duration > winner.duration ||
      (summary.duration === winner.duration && summary.latestTimestamp > winner.latestTimestamp)
    ) {
      winner = { app: appName, ...summary }
    }
  }

  if (!winner) {
    console.log('[activitywatch] no winner found, skipping minute')
    return
  }

  const dominance = Math.max(0, Math.min(winner.duration / 60, 1))

  logMinuteRecord({
    timestamp: start.toISOString(),
    app: winner.app,
    title: winner.title,
    dominance: Number(dominance.toFixed(2)),
    afk: isAfk
  })
}

function stopActivityWatchProcesses(): void {
  for (const processToStop of [awWatcherAfkProcess, awWatcherWindowProcess, awServerProcess]) {
    if (processToStop && processToStop.exitCode === null && !processToStop.killed) {
      processToStop.kill('SIGTERM')
    }
  }
}

function stopActivityWatchMonitoring(): void {
  if (bucketDiscoveryTimeout) {
    clearTimeout(bucketDiscoveryTimeout)
    bucketDiscoveryTimeout = null
  }

  stopMinuteScheduler()
  stopActivityWatchProcesses()
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  initializeDatabase()

  void startActivityWatchOnLaunch().finally(() => {
    scheduleBucketDiscovery()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopActivityWatchMonitoring()
  closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
