import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { type ActivityWatchEvent } from '../pipeline/minute'

const ACTIVITYWATCH_BASE_URL = new URL('http://localhost:5600')
const ACTIVITYWATCH_STARTUP_TIMEOUT_MS = 20_000
const ACTIVITYWATCH_STARTUP_POLL_MS = 500
const EVENT_FETCH_LIMIT = 100

const AW_SERVER_NAME = 'aw-server'
const AW_WATCHER_WINDOW_NAME = 'aw-watcher-window'
const AW_WATCHER_AFK_NAME = 'aw-watcher-afk'

type ActivityWatchBucketsResponse = Record<string, unknown>

type ProcessCheckResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error: Error | null
}

export type BucketPair = {
  windowBucketId: string
  afkBucketId: string
}

export type ActivityWatchService = {
  startOnLaunch: () => Promise<void>
  discoverBuckets: () => Promise<BucketPair | null>
  fetchBucketEvents: <TData extends Record<string, unknown>>(
    bucketId: string,
    start: Date,
    end: Date
  ) => Promise<ActivityWatchEvent<TData>[] | null>
  stop: () => void
}

export function createActivityWatchService(): ActivityWatchService {
  let activityWatchStartupPromise: Promise<void> | null = null
  let awServerProcess: ChildProcessWithoutNullStreams | null = null
  let awWatcherWindowProcess: ChildProcessWithoutNullStreams | null = null
  let awWatcherAfkProcess: ChildProcessWithoutNullStreams | null = null

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

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
      join(__dirname, '../../../resources/activitywatch', platformDir)
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
        pgrepResult.error ??
          psResult.error ??
          new Error(psResult.stderr || 'Unknown process lookup failure')
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

  function startOnLaunch(): Promise<void> {
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

  async function discoverBuckets(): Promise<BucketPair | null> {
    const buckets = await fetchBuckets()
    if (!buckets) {
      return null
    }

    const bucketIds = Object.keys(buckets)
    console.log('[activitywatch] bucket ids:', bucketIds)

    const windowBucketId =
      bucketIds.find((bucketId) => bucketId.includes(AW_WATCHER_WINDOW_NAME)) ?? null
    const afkBucketId = bucketIds.find((bucketId) => bucketId.includes(AW_WATCHER_AFK_NAME)) ?? null

    if (!windowBucketId || !afkBucketId) {
      const missingBuckets = [
        !windowBucketId ? AW_WATCHER_WINDOW_NAME : null,
        !afkBucketId ? AW_WATCHER_AFK_NAME : null
      ].filter((bucketName): bucketName is string => bucketName !== null)

      console.warn(
        `[activitywatch] Missing bucket(s): ${missingBuckets.join(', ')}. Retrying in 5s.`
      )
      return null
    }

    console.log(
      `[activitywatch] using window bucket "${windowBucketId}" and afk bucket "${afkBucketId}"`
    )

    return {
      windowBucketId,
      afkBucketId
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

  function stop(): void {
    for (const processToStop of [awWatcherAfkProcess, awWatcherWindowProcess, awServerProcess]) {
      if (processToStop && processToStop.exitCode === null && !processToStop.killed) {
        processToStop.kill('SIGTERM')
      }
    }
  }

  return {
    startOnLaunch,
    discoverBuckets,
    fetchBucketEvents,
    stop
  }
}
