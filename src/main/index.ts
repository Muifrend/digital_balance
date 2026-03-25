import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  PIPELINE_GET_STATUS_CHANNEL,
  PIPELINE_STATUS_CHANNEL,
  createInitialPipelineStatus,
  type PipelineStatus,
  type PipelineTrigger
} from '../shared/pipeline'
import icon from '../../resources/icon.png?asset'

const ACTIVITYWATCH_BASE_URL = new URL('http://localhost:5600')
const ACTIVITYWATCH_RETRY_MS = 5_000
const ACTIVITYWATCH_STARTUP_TIMEOUT_MS = 20_000
const ACTIVITYWATCH_STARTUP_POLL_MS = 500
const MINUTE_MS = 60_000
const EVENT_FETCH_LIMIT = 100
const RECONCILIATION_LOOKBACK_MINUTES = 5
const AFK_WINDOW_ACTIVE_THRESHOLD_SECONDS = 50
const AFK_STREAK_THRESHOLD_MINUTES = 3
const CLASSIFICATION_QUEUE_MAX_PENDING = 10_000

const PIPELINE_VERSION = 'minute-pipeline-v2'
const AFK_LOGIC_VERSION = 'rolling-afk-v1'
const REVIEW_FLAG_VERSION = 'needs-review-v1'
const CLASSIFIER_QUEUE_VERSION = 'classification-queue-v1'

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

type MinuteStatus = 'winner' | 'empty_window' | 'no_winner'

type WinnerSummary = {
  app: string
  title: string | null
  duration: number
  latestTimestampMs: number
  latestTimestampIso: string | null
}

type ProcessCheckResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  error: Error | null
}

type DatabaseWriteResult = {
  changes: number
  lastInsertRowid: number | bigint
}

type MigrationRow = {
  id: number
}

type ColumnInfoRow = {
  name: string
}

type MinuteRowLookup = {
  id: number
}

type PreviousAfkStreakRow = {
  afk_streak_minutes: number | null
}

type PendingClassificationCountRow = {
  count: number
}

type ReviewAssessment = {
  needsReview: boolean
  reasons: string[]
}

type TimezoneSnapshot = {
  timezoneName: string
  utcOffsetMinutes: number
}

type MinuteDerivationInput = {
  minuteTimestamp: string
  timezoneName: string
  utcOffsetMinutes: number
  windowBucketId: string | null
  afkBucketId: string | null
  windowEvents: ActivityWatchEvent<WindowEventData>[]
  afkEvents: ActivityWatchEvent<AfkEventData>[]
  previousAfkStreak: number
}

type RebuildMinutesProjectionOptions = {
  fromTimestamp?: string
  toTimestamp?: string
}

type MinuteIngestProjectionRow = {
  minute_timestamp: string
  timezone_name: string
  utc_offset_minutes: number
  source_window_bucket_id: string | null
  source_afk_bucket_id: string | null
  window_events_json: string
  afk_events_json: string
}

type PreviousMinuteIngestAfkRow = {
  minute_timestamp: string
  afk_events_json: string
}

type MinutePersistencePayload = {
  minuteTimestamp: string
  record: MinuteRecord | null
  status: MinuteStatus
  timezoneName: string
  utcOffsetMinutes: number
  windowBucketId: string | null
  afkBucketId: string | null
  windowEvents: ActivityWatchEvent<WindowEventData>[]
  afkEvents: ActivityWatchEvent<AfkEventData>[]
  afkDurationSeconds: number
  afkWindowActive: boolean
  afkStreakMinutes: number
  needsReview: boolean
  needsReviewReasons: string[]
  winner: WinnerSummary | null
}

type ClassificationJobPayload = {
  timestamp: string
  timezone_name: string
  utc_offset_minutes: number
  app: string | null
  title: string | null
  dominance: number | null
  afk: boolean
  needs_review: boolean
  needs_review_reasons: string[]
  summary_status: MinuteStatus
  classification_candidate: boolean
  source_window_bucket_id: string | null
  source_afk_bucket_id: string | null
  afk_duration_seconds: number
  afk_streak_minutes: number
  window_event_count: number
  afk_event_count: number
  pipeline_version: string
  afk_logic_version: string
  review_flag_version: string
  classifier_queue_version: string
}

let bucketDiscoveryTimeout: NodeJS.Timeout | null = null
let minuteStartTimeout: NodeJS.Timeout | null = null
let minuteInterval: NodeJS.Timeout | null = null
let isDiscoveringBuckets = false
let activityWatchStartupPromise: Promise<void> | null = null
let windowBucketId: string | null = null
let afkBucketId: string | null = null
let database: Database.Database | null = null
let upsertMinuteStatement: Database.Statement | null = null
let upsertMinuteIngestStatement: Database.Statement | null = null
let upsertClassificationJobStatement: Database.Statement | null = null
let deleteMinuteStatement: Database.Statement | null = null
let deleteClassificationJobStatement: Database.Statement | null = null
let selectMinuteIdStatement: Database.Statement | null = null
let selectPreviousAfkStreakStatement: Database.Statement | null = null
let countPendingClassificationJobsStatement: Database.Statement | null = null
let prunePendingClassificationJobsStatement: Database.Statement | null = null
let persistMinutePayloadTransaction:
  | ((payload: MinutePersistencePayload, logDatabase: boolean) => void)
  | null = null
let minuteReconciliationQueue: Promise<boolean> = Promise.resolve(true)
let pipelineStatus: PipelineStatus = createInitialPipelineStatus()

let awServerProcess: ChildProcessWithoutNullStreams | null = null
let awWatcherWindowProcess: ChildProcessWithoutNullStreams | null = null
let awWatcherAfkProcess: ChildProcessWithoutNullStreams | null = null

// Derived materialized summary rebuilt from the canonical minute_ingest table.
const CREATE_MINUTES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS minutes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL UNIQUE,
    timezone_name TEXT,
    utc_offset_minutes INTEGER,
    app         TEXT,
    title       TEXT,
    dominance   REAL,
    afk         INTEGER DEFAULT 0,
    needs_review INTEGER DEFAULT 0,
    afk_duration_seconds REAL DEFAULT 0,
    afk_streak_minutes INTEGER DEFAULT 0,
    source_window_bucket_id TEXT,
    source_afk_bucket_id TEXT,
    pipeline_version TEXT,
    afk_logic_version TEXT,
    review_flag_version TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`

const CREATE_SCHEMA_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`

// Canonical per-minute source of truth for replay/rebuild. This is intentionally
// row-per-minute and updatable during reconciliation; it is not append-only yet.
const CREATE_MINUTE_INGEST_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS minute_ingest (
    minute_timestamp TEXT PRIMARY KEY,
    summary_status TEXT NOT NULL,
    timezone_name TEXT NOT NULL,
    utc_offset_minutes INTEGER NOT NULL,
    source_window_bucket_id TEXT,
    source_afk_bucket_id TEXT,
    window_event_count INTEGER NOT NULL DEFAULT 0,
    afk_event_count INTEGER NOT NULL DEFAULT 0,
    afk_duration_seconds REAL NOT NULL DEFAULT 0,
    afk_window_active INTEGER NOT NULL DEFAULT 0,
    afk_streak_minutes INTEGER NOT NULL DEFAULT 0,
    winning_app TEXT,
    winning_title TEXT,
    winning_duration_seconds REAL,
    winning_latest_timestamp TEXT,
    dominance REAL,
    afk INTEGER NOT NULL DEFAULT 0,
    needs_review INTEGER NOT NULL DEFAULT 0,
    needs_review_reasons_json TEXT NOT NULL DEFAULT '[]',
    window_events_json TEXT NOT NULL,
    afk_events_json TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    afk_logic_version TEXT NOT NULL,
    review_flag_version TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`

const CREATE_CLASSIFICATION_JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS classification_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_timestamp TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    classifier_version TEXT,
    prompt_version TEXT,
    model_name TEXT,
    last_error TEXT,
    next_attempt_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`

const CREATE_CLASSIFICATION_JOBS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_classification_jobs_status
  ON classification_jobs(status, next_attempt_at, created_at);
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

function getPipelineStatusSnapshot(): PipelineStatus {
  return { ...pipelineStatus }
}

function broadcastPipelineStatus(): void {
  const snapshot = getPipelineStatusSnapshot()

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(PIPELINE_STATUS_CHANNEL, snapshot)
    }
  }
}

function setPipelineStatus(status: PipelineStatus): void {
  pipelineStatus = status
  broadcastPipelineStatus()
}

function getReconciliationRangeStart(referenceEnd: Date): Date {
  return new Date(referenceEnd.getTime() - RECONCILIATION_LOOKBACK_MINUTES * MINUTE_MS)
}

function startPipelineReconciliation(
  trigger: PipelineTrigger,
  rangeStart: Date,
  rangeEnd: Date
): string {
  const startedAt = new Date().toISOString()

  setPipelineStatus({
    phase: 'reconciling',
    trigger,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    startedAt,
    lastCompletedAt: pipelineStatus.lastCompletedAt,
    lastError: null
  })

  return startedAt
}

function completePipelineReconciliation(
  trigger: PipelineTrigger,
  rangeStart: Date,
  rangeEnd: Date,
  startedAt: string
): void {
  setPipelineStatus({
    phase: 'idle',
    trigger,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    startedAt,
    lastCompletedAt: new Date().toISOString(),
    lastError: null
  })
}

function failPipelineReconciliation(
  trigger: PipelineTrigger,
  rangeStart: Date,
  rangeEnd: Date,
  startedAt: string,
  lastError: string
): void {
  setPipelineStatus({
    phase: 'error',
    trigger,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    startedAt,
    lastCompletedAt: pipelineStatus.lastCompletedAt,
    lastError
  })
}

function getTimezoneSnapshot(date: Date): TimezoneSnapshot {
  return {
    timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    utcOffsetMinutes: -date.getTimezoneOffset()
  }
}

function tableHasColumn(
  databaseInstance: Database.Database,
  tableName: string,
  columnName: string
): boolean {
  const columnRows = databaseInstance
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as ColumnInfoRow[]
  return columnRows.some((column) => column.name === columnName)
}

function addColumnIfMissing(
  databaseInstance: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  if (!tableHasColumn(databaseInstance, tableName, columnName)) {
    databaseInstance.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}

function runDatabaseMigrations(databaseInstance: Database.Database): void {
  databaseInstance.exec(CREATE_SCHEMA_MIGRATIONS_TABLE_SQL)

  const migrations = [
    {
      id: 1,
      name: 'create_minutes_table',
      run: (): void => {
        databaseInstance.exec(CREATE_MINUTES_TABLE_SQL)
      }
    },
    {
      id: 2,
      name: 'expand_minutes_table',
      run: (): void => {
        addColumnIfMissing(databaseInstance, 'minutes', 'needs_review', 'INTEGER DEFAULT 0')
        addColumnIfMissing(databaseInstance, 'minutes', 'timezone_name', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'utc_offset_minutes', 'INTEGER')
        addColumnIfMissing(databaseInstance, 'minutes', 'afk_duration_seconds', 'REAL DEFAULT 0')
        addColumnIfMissing(databaseInstance, 'minutes', 'afk_streak_minutes', 'INTEGER DEFAULT 0')
        addColumnIfMissing(databaseInstance, 'minutes', 'source_window_bucket_id', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'source_afk_bucket_id', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'pipeline_version', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'afk_logic_version', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'review_flag_version', 'TEXT')
        addColumnIfMissing(databaseInstance, 'minutes', 'updated_at', 'TEXT')
        databaseInstance.exec("UPDATE minutes SET updated_at = datetime('now') WHERE updated_at IS NULL")
      }
    },
    {
      id: 3,
      name: 'create_minute_ingest_table',
      run: (): void => {
        databaseInstance.exec(CREATE_MINUTE_INGEST_TABLE_SQL)
      }
    },
    {
      id: 4,
      name: 'create_classification_jobs_table',
      run: (): void => {
        databaseInstance.exec(CREATE_CLASSIFICATION_JOBS_TABLE_SQL)
        databaseInstance.exec(CREATE_CLASSIFICATION_JOBS_INDEX_SQL)
      }
    }
  ]

  const hasMigrationStatement = databaseInstance.prepare(
    'SELECT id FROM schema_migrations WHERE id = ?'
  )
  const recordMigrationStatement = databaseInstance.prepare(
    'INSERT INTO schema_migrations (id, name) VALUES (?, ?)'
  )

  const applyMigrations = databaseInstance.transaction(() => {
    for (const migration of migrations) {
      const existingMigration = hasMigrationStatement.get(migration.id) as MigrationRow | undefined
      if (existingMigration) {
        continue
      }

      migration.run()
      recordMigrationStatement.run(migration.id, migration.name)
    }
  })

  applyMigrations()
}

function initializeDatabase(): void {
  try {
    const databasePath = join(app.getPath('userData'), 'digital_balance.db')
    database = new Database(databasePath)
    database.pragma('journal_mode = WAL')
    runDatabaseMigrations(database)

    upsertMinuteStatement = database.prepare(`
      INSERT INTO minutes (
        timestamp,
        timezone_name,
        utc_offset_minutes,
        app,
        title,
        dominance,
        afk,
        needs_review,
        afk_duration_seconds,
        afk_streak_minutes,
        source_window_bucket_id,
        source_afk_bucket_id,
        pipeline_version,
        afk_logic_version,
        review_flag_version,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(timestamp) DO UPDATE SET
        timezone_name = excluded.timezone_name,
        utc_offset_minutes = excluded.utc_offset_minutes,
        app = excluded.app,
        title = excluded.title,
        dominance = excluded.dominance,
        afk = excluded.afk,
        needs_review = excluded.needs_review,
        afk_duration_seconds = excluded.afk_duration_seconds,
        afk_streak_minutes = excluded.afk_streak_minutes,
        source_window_bucket_id = excluded.source_window_bucket_id,
        source_afk_bucket_id = excluded.source_afk_bucket_id,
        pipeline_version = excluded.pipeline_version,
        afk_logic_version = excluded.afk_logic_version,
        review_flag_version = excluded.review_flag_version,
        updated_at = datetime('now')
    `)

    upsertMinuteIngestStatement = database.prepare(`
      INSERT INTO minute_ingest (
        minute_timestamp,
        summary_status,
        timezone_name,
        utc_offset_minutes,
        source_window_bucket_id,
        source_afk_bucket_id,
        window_event_count,
        afk_event_count,
        afk_duration_seconds,
        afk_window_active,
        afk_streak_minutes,
        winning_app,
        winning_title,
        winning_duration_seconds,
        winning_latest_timestamp,
        dominance,
        afk,
        needs_review,
        needs_review_reasons_json,
        window_events_json,
        afk_events_json,
        pipeline_version,
        afk_logic_version,
        review_flag_version,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(minute_timestamp) DO UPDATE SET
        summary_status = excluded.summary_status,
        timezone_name = excluded.timezone_name,
        utc_offset_minutes = excluded.utc_offset_minutes,
        source_window_bucket_id = excluded.source_window_bucket_id,
        source_afk_bucket_id = excluded.source_afk_bucket_id,
        window_event_count = excluded.window_event_count,
        afk_event_count = excluded.afk_event_count,
        afk_duration_seconds = excluded.afk_duration_seconds,
        afk_window_active = excluded.afk_window_active,
        afk_streak_minutes = excluded.afk_streak_minutes,
        winning_app = excluded.winning_app,
        winning_title = excluded.winning_title,
        winning_duration_seconds = excluded.winning_duration_seconds,
        winning_latest_timestamp = excluded.winning_latest_timestamp,
        dominance = excluded.dominance,
        afk = excluded.afk,
        needs_review = excluded.needs_review,
        needs_review_reasons_json = excluded.needs_review_reasons_json,
        window_events_json = excluded.window_events_json,
        afk_events_json = excluded.afk_events_json,
        pipeline_version = excluded.pipeline_version,
        afk_logic_version = excluded.afk_logic_version,
        review_flag_version = excluded.review_flag_version,
        updated_at = datetime('now')
    `)

    upsertClassificationJobStatement = database.prepare(`
      INSERT INTO classification_jobs (
        minute_timestamp,
        status,
        attempt_count,
        payload_json,
        classifier_version,
        prompt_version,
        model_name,
        last_error,
        next_attempt_at,
        updated_at
      )
      VALUES (?, 'pending', 0, ?, NULL, NULL, NULL, NULL, NULL, datetime('now'))
      ON CONFLICT(minute_timestamp) DO UPDATE SET
        status = 'pending',
        attempt_count = 0,
        payload_json = excluded.payload_json,
        classifier_version = NULL,
        prompt_version = NULL,
        model_name = NULL,
        last_error = NULL,
        next_attempt_at = NULL,
        updated_at = datetime('now')
    `)

    deleteMinuteStatement = database.prepare('DELETE FROM minutes WHERE timestamp = ?')
    deleteClassificationJobStatement = database.prepare(
      'DELETE FROM classification_jobs WHERE minute_timestamp = ?'
    )
    selectMinuteIdStatement = database.prepare('SELECT id FROM minutes WHERE timestamp = ?')
    selectPreviousAfkStreakStatement = database.prepare(
      'SELECT afk_streak_minutes FROM minute_ingest WHERE minute_timestamp = ?'
    )
    countPendingClassificationJobsStatement = database.prepare(
      "SELECT COUNT(*) as count FROM classification_jobs WHERE status = 'pending'"
    )
    prunePendingClassificationJobsStatement = database.prepare(`
      DELETE FROM classification_jobs
      WHERE id IN (
        SELECT id
        FROM classification_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC, id ASC
        LIMIT ?
      )
    `)

    const transaction = database.transaction(
      (payload: MinutePersistencePayload, logDatabase: boolean): void => {
        if (
          !upsertMinuteStatement ||
          !upsertMinuteIngestStatement ||
          !upsertClassificationJobStatement ||
          !deleteMinuteStatement ||
          !deleteClassificationJobStatement ||
          !selectMinuteIdStatement ||
          !countPendingClassificationJobsStatement ||
          !prunePendingClassificationJobsStatement
        ) {
          throw new Error('Database statements not prepared')
        }

        const existingMinute = payload.record
          ? ((selectMinuteIdStatement.get(payload.minuteTimestamp) as
              | MinuteRowLookup
              | undefined) ?? null)
          : null

        const upsertedMinute = payload.record
          ? (upsertMinuteStatement.run(
              payload.minuteTimestamp,
              payload.timezoneName,
              payload.utcOffsetMinutes,
              payload.record.app,
              payload.record.title,
              payload.record.dominance,
              payload.record.afk ? 1 : 0,
              payload.needsReview ? 1 : 0,
              payload.afkDurationSeconds,
              payload.afkStreakMinutes,
              payload.windowBucketId,
              payload.afkBucketId,
              PIPELINE_VERSION,
              AFK_LOGIC_VERSION,
              REVIEW_FLAG_VERSION
            ) as DatabaseWriteResult)
          : null

        upsertMinuteIngestStatement.run(
          payload.minuteTimestamp,
          payload.status,
          payload.timezoneName,
          payload.utcOffsetMinutes,
          payload.windowBucketId,
          payload.afkBucketId,
          payload.windowEvents.length,
          payload.afkEvents.length,
          payload.afkDurationSeconds,
          payload.afkWindowActive ? 1 : 0,
          payload.afkStreakMinutes,
          payload.winner?.app ?? null,
          payload.winner?.title ?? null,
          payload.winner?.duration ?? null,
          payload.winner?.latestTimestampIso ?? null,
          payload.record?.dominance ?? null,
          payload.record?.afk ? 1 : 0,
          payload.needsReview ? 1 : 0,
          JSON.stringify(payload.needsReviewReasons),
          JSON.stringify(payload.windowEvents),
          JSON.stringify(payload.afkEvents),
          PIPELINE_VERSION,
          AFK_LOGIC_VERSION,
          REVIEW_FLAG_VERSION
        )

        const classificationJobPayload = buildClassificationJobPayload(payload)

        if (classificationJobPayload) {
          upsertClassificationJobStatement.run(
            payload.minuteTimestamp,
            JSON.stringify(classificationJobPayload)
          )
          prunePendingClassificationJobs()
        } else if (payload.status !== 'no_winner') {
          deleteClassificationJobStatement.run(payload.minuteTimestamp)
        }

        if (!payload.record) {
          if (payload.status === 'no_winner') {
            return
          }

          deleteMinuteStatement.run(payload.minuteTimestamp)
          return
        }

        if (logDatabase) {
          if (existingMinute) {
            console.log(`[db] updated minute ${payload.minuteTimestamp} (id: ${existingMinute.id})`)
          } else {
            console.log(
              `[db] inserted minute ${payload.minuteTimestamp} (id: ${String(upsertedMinute?.lastInsertRowid ?? 'unknown')})`
            )
          }
        }
      }
    )

    persistMinutePayloadTransaction = (payload, logDatabase) => {
      transaction(payload, logDatabase)
    }

    prunePendingClassificationJobs()
  } catch (error) {
    console.error('[db] Failed to initialize database:', error)
    database = null
    upsertMinuteStatement = null
    upsertMinuteIngestStatement = null
    upsertClassificationJobStatement = null
    deleteMinuteStatement = null
    deleteClassificationJobStatement = null
    selectMinuteIdStatement = null
    selectPreviousAfkStreakStatement = null
    countPendingClassificationJobsStatement = null
    prunePendingClassificationJobsStatement = null
    persistMinutePayloadTransaction = null
  }
}

function assessNeedsReview(record: MinuteRecord): ReviewAssessment {
  const normalizedApp = record.app?.trim().toLowerCase() ?? null
  const normalizedTitle = record.title?.trim().toLowerCase() ?? null
  const reasons: string[] = []

  if (normalizedApp === 'unknown') {
    reasons.push('app_unknown')
  }

  if (normalizedTitle === 'unknown') {
    reasons.push('title_unknown')
  }

  if (record.app === '') {
    reasons.push('app_empty')
  }

  if (record.dominance !== null && record.dominance < 0.2) {
    reasons.push('low_dominance')
  }

  return {
    needsReview: reasons.length > 0,
    reasons
  }
}

function getAfkDurationSeconds(afkEvents: ActivityWatchEvent<AfkEventData>[]): number {
  return afkEvents.reduce((total, event) => {
    return event.data.status === 'afk' ? total + event.duration : total
  }, 0)
}

function isAfkWindowActive(afkDurationSeconds: number): boolean {
  return afkDurationSeconds > AFK_WINDOW_ACTIVE_THRESHOLD_SECONDS
}

function getAfkStreakMinutes(previousAfkStreak: number, afkWindowActive: boolean): number {
  return afkWindowActive ? previousAfkStreak + 1 : 0
}

function getDominance(durationSeconds: number): number {
  return Number(Math.max(0, Math.min(durationSeconds / 60, 1)).toFixed(2))
}

function isClassificationCandidate(record: MinuteRecord | null): record is MinuteRecord {
  return Boolean(
    record && (record.app !== null || record.title !== null || record.dominance !== null)
  )
}

function buildClassificationJobPayload(
  payload: MinutePersistencePayload
): ClassificationJobPayload | null {
  if (!isClassificationCandidate(payload.record)) {
    return null
  }

  return {
    timestamp: payload.minuteTimestamp,
    timezone_name: payload.timezoneName,
    utc_offset_minutes: payload.utcOffsetMinutes,
    app: payload.record.app,
    title: payload.record.title,
    dominance: payload.record.dominance,
    afk: payload.record.afk,
    needs_review: payload.needsReview,
    needs_review_reasons: payload.needsReviewReasons,
    summary_status: payload.status,
    classification_candidate: true,
    source_window_bucket_id: payload.windowBucketId,
    source_afk_bucket_id: payload.afkBucketId,
    afk_duration_seconds: payload.afkDurationSeconds,
    afk_streak_minutes: payload.afkStreakMinutes,
    window_event_count: payload.windowEvents.length,
    afk_event_count: payload.afkEvents.length,
    pipeline_version: PIPELINE_VERSION,
    afk_logic_version: AFK_LOGIC_VERSION,
    review_flag_version: REVIEW_FLAG_VERSION,
    classifier_queue_version: CLASSIFIER_QUEUE_VERSION
  }
}

function prunePendingClassificationJobs(): number {
  if (!countPendingClassificationJobsStatement || !prunePendingClassificationJobsStatement) {
    return 0
  }

  const pendingCountRow = countPendingClassificationJobsStatement.get() as
    | PendingClassificationCountRow
    | undefined
  const overflow = Math.max(0, (pendingCountRow?.count ?? 0) - CLASSIFICATION_QUEUE_MAX_PENDING)
  if (overflow === 0) {
    return 0
  }

  const result = prunePendingClassificationJobsStatement.run(overflow) as DatabaseWriteResult
  if (result.changes > 0) {
    console.log(`[db] pruned classification queue by ${result.changes} rows`)
  }

  return result.changes
}

function getPreviousAfkStreak(minuteTimestamp: string): number {
  if (!selectPreviousAfkStreakStatement) {
    return 0
  }

  const previousMinuteTimestamp = new Date(
    new Date(minuteTimestamp).getTime() - MINUTE_MS
  ).toISOString()
  const previousRow = selectPreviousAfkStreakStatement.get(previousMinuteTimestamp) as
    | PreviousAfkStreakRow
    | undefined

  return previousRow?.afk_streak_minutes ?? 0
}

function persistMinutePayload(payload: MinutePersistencePayload, logDatabase: boolean): void {
  if (!database || !persistMinutePayloadTransaction) {
    return
  }

  try {
    persistMinutePayloadTransaction(payload, logDatabase)
  } catch (error) {
    console.error(`[db] Failed to persist minute payload ${payload.minuteTimestamp}:`, error)
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
    upsertMinuteStatement = null
    upsertMinuteIngestStatement = null
    upsertClassificationJobStatement = null
    deleteMinuteStatement = null
    deleteClassificationJobStatement = null
    selectMinuteIdStatement = null
    selectPreviousAfkStreakStatement = null
    countPendingClassificationJobsStatement = null
    prunePendingClassificationJobsStatement = null
    persistMinutePayloadTransaction = null
    database = null
  }
}

function buildTimestampRangeClause(
  columnName: string,
  options?: RebuildMinutesProjectionOptions
): { clause: string; params: string[] } {
  const conditions: string[] = []
  const params: string[] = []

  if (options?.fromTimestamp) {
    conditions.push(`${columnName} >= ?`)
    params.push(options.fromTimestamp)
  }

  if (options?.toTimestamp) {
    conditions.push(`${columnName} <= ?`)
    params.push(options.toTimestamp)
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  }
}

function parseStoredEvents<TData extends Record<string, unknown>>(
  eventsJson: string,
  minuteTimestamp: string,
  label: 'window' | 'afk'
): ActivityWatchEvent<TData>[] {
  try {
    const parsedEvents = JSON.parse(eventsJson)
    if (!Array.isArray(parsedEvents)) {
      throw new Error('Expected an array of ActivityWatch events')
    }

    return parsedEvents as ActivityWatchEvent<TData>[]
  } catch (error) {
    console.warn(`[db] Failed to parse ${label} events for ${minuteTimestamp}:`, error)
    return []
  }
}

function getExpectedPreviousMinuteTimestamp(minuteTimestamp: string): string {
  return new Date(new Date(minuteTimestamp).getTime() - MINUTE_MS).toISOString()
}

function getPreviousAfkStreakForRebuild(minuteTimestamp: string): number {
  if (!database) {
    return 0
  }

  const previousRows = database
    .prepare(
      `
        SELECT minute_timestamp, afk_events_json
        FROM minute_ingest
        WHERE minute_timestamp < ?
        ORDER BY minute_timestamp DESC
      `
    )
    .all(minuteTimestamp) as PreviousMinuteIngestAfkRow[]

  let expectedMinuteTimestamp = getExpectedPreviousMinuteTimestamp(minuteTimestamp)
  let streak = 0

  for (const row of previousRows) {
    if (row.minute_timestamp !== expectedMinuteTimestamp) {
      break
    }

    const afkEvents = parseStoredEvents<AfkEventData>(
      row.afk_events_json,
      row.minute_timestamp,
      'afk'
    )
    if (!isAfkWindowActive(getAfkDurationSeconds(afkEvents))) {
      break
    }

    streak += 1
    expectedMinuteTimestamp = getExpectedPreviousMinuteTimestamp(row.minute_timestamp)
  }

  return streak
}

function clearProjectionTables(options?: RebuildMinutesProjectionOptions): void {
  if (!database) {
    return
  }

  const minutesRange = buildTimestampRangeClause('timestamp', options)
  if (minutesRange.clause) {
    database.prepare(`DELETE FROM minutes ${minutesRange.clause}`).run(...minutesRange.params)
  } else {
    database.prepare('DELETE FROM minutes').run()
  }

  const jobsRange = buildTimestampRangeClause('minute_timestamp', options)
  if (jobsRange.clause) {
    database.prepare(`DELETE FROM classification_jobs ${jobsRange.clause}`).run(...jobsRange.params)
  } else {
    database.prepare('DELETE FROM classification_jobs').run()
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
  stopMinuteScheduler()
  scheduleBucketDiscovery(ACTIVITYWATCH_RETRY_MS)
}

function emitMinutePayload(payload: MinutePersistencePayload, logRecord: boolean): void {
  if (payload.record && logRecord) {
    console.log(JSON.stringify(payload.record))
  }

  if (!payload.record && payload.status === 'no_winner' && logRecord) {
    console.log('[activitywatch] no winner found, skipping minute')
  }

  persistMinutePayload(payload, logRecord)
}

function summarizeWinningWindow(
  windowEvents: ActivityWatchEvent<WindowEventData>[]
): WinnerSummary | null {
  const appTotals = new Map<
    string,
    {
      duration: number
      latestTimestampMs: number
      latestTimestampIso: string | null
      title: string | null
    }
  >()

  for (const event of windowEvents) {
    const appName = event.data.app?.trim() || 'Unknown'
    const title = event.data.title?.trim() || null
    const parsedTimestamp = Date.parse(event.timestamp)
    const eventTimestampMs = Number.isNaN(parsedTimestamp)
      ? Number.NEGATIVE_INFINITY
      : parsedTimestamp
    const existingEntry = appTotals.get(appName)

    if (!existingEntry) {
      appTotals.set(appName, {
        duration: event.duration,
        latestTimestampMs: eventTimestampMs,
        latestTimestampIso: Number.isNaN(parsedTimestamp) ? null : event.timestamp,
        title
      })
      continue
    }

    existingEntry.duration += event.duration

    if (eventTimestampMs >= existingEntry.latestTimestampMs) {
      existingEntry.latestTimestampMs = eventTimestampMs
      existingEntry.latestTimestampIso = Number.isNaN(parsedTimestamp) ? null : event.timestamp
      existingEntry.title = title
    }
  }

  let winner: WinnerSummary | null = null

  for (const [appName, summary] of appTotals) {
    if (
      !winner ||
      summary.duration > winner.duration ||
      (summary.duration === winner.duration && summary.latestTimestampMs > winner.latestTimestampMs)
    ) {
      winner = {
        app: appName,
        title: summary.title,
        duration: summary.duration,
        latestTimestampMs: summary.latestTimestampMs,
        latestTimestampIso: summary.latestTimestampIso
      }
    }
  }

  return winner
}

function deriveMinutePersistencePayload(input: MinuteDerivationInput): MinutePersistencePayload {
  const afkDurationSeconds = getAfkDurationSeconds(input.afkEvents)
  const afkWindowActive = isAfkWindowActive(afkDurationSeconds)
  const afkStreakMinutes = getAfkStreakMinutes(input.previousAfkStreak, afkWindowActive)

  if (input.windowEvents.length === 0) {
    return {
      minuteTimestamp: input.minuteTimestamp,
      status: 'empty_window',
      record: {
        timestamp: input.minuteTimestamp,
        app: null,
        title: null,
        dominance: null,
        afk: true
      },
      timezoneName: input.timezoneName,
      utcOffsetMinutes: input.utcOffsetMinutes,
      windowBucketId: input.windowBucketId,
      afkBucketId: input.afkBucketId,
      windowEvents: input.windowEvents,
      afkEvents: input.afkEvents,
      afkDurationSeconds,
      afkWindowActive,
      afkStreakMinutes,
      needsReview: false,
      needsReviewReasons: [],
      winner: null
    }
  }

  const winner = summarizeWinningWindow(input.windowEvents)
  if (!winner) {
    return {
      minuteTimestamp: input.minuteTimestamp,
      status: 'no_winner',
      record: null,
      timezoneName: input.timezoneName,
      utcOffsetMinutes: input.utcOffsetMinutes,
      windowBucketId: input.windowBucketId,
      afkBucketId: input.afkBucketId,
      windowEvents: input.windowEvents,
      afkEvents: input.afkEvents,
      afkDurationSeconds,
      afkWindowActive,
      afkStreakMinutes,
      needsReview: false,
      needsReviewReasons: [],
      winner: null
    }
  }

  const record: MinuteRecord = {
    timestamp: input.minuteTimestamp,
    app: winner.app,
    title: winner.title,
    dominance: getDominance(winner.duration),
    afk: afkStreakMinutes >= AFK_STREAK_THRESHOLD_MINUTES
  }
  const reviewAssessment = assessNeedsReview(record)

  return {
    minuteTimestamp: input.minuteTimestamp,
    status: 'winner',
    record,
    timezoneName: input.timezoneName,
    utcOffsetMinutes: input.utcOffsetMinutes,
    windowBucketId: input.windowBucketId,
    afkBucketId: input.afkBucketId,
    windowEvents: input.windowEvents,
    afkEvents: input.afkEvents,
    afkDurationSeconds,
    afkWindowActive,
    afkStreakMinutes,
    needsReview: reviewAssessment.needsReview,
    needsReviewReasons: reviewAssessment.reasons,
    winner
  }
}

function buildMinutePersistencePayload(
  start: Date,
  windowBucketId: string,
  afkBucketId: string,
  windowEvents: ActivityWatchEvent<WindowEventData>[],
  afkEvents: ActivityWatchEvent<AfkEventData>[]
): MinutePersistencePayload {
  const minuteTimestamp = start.toISOString()
  const timezoneSnapshot = getTimezoneSnapshot(start)
  return deriveMinutePersistencePayload({
    minuteTimestamp,
    timezoneName: timezoneSnapshot.timezoneName,
    utcOffsetMinutes: timezoneSnapshot.utcOffsetMinutes,
    windowBucketId,
    afkBucketId,
    windowEvents,
    afkEvents,
    previousAfkStreak: getPreviousAfkStreak(minuteTimestamp)
  })
}

// Rebuild the read-optimized projections from the canonical minute_ingest rows.
// This is intentionally internal in this slice and is not invoked automatically.
function rebuildMinutesProjection(options?: RebuildMinutesProjectionOptions): void {
  if (!database) {
    return
  }

  const range = buildTimestampRangeClause('minute_timestamp', options)
  const ingestRows = database
    .prepare(
      `
        SELECT
          minute_timestamp,
          timezone_name,
          utc_offset_minutes,
          source_window_bucket_id,
          source_afk_bucket_id,
          window_events_json,
          afk_events_json
        FROM minute_ingest
        ${range.clause}
        ORDER BY minute_timestamp ASC
      `
    )
    .all(...range.params) as MinuteIngestProjectionRow[]

  const rangeStart = ingestRows[0]
    ? new Date(ingestRows[0].minute_timestamp)
    : options?.fromTimestamp
      ? new Date(options.fromTimestamp)
      : new Date()
  const rangeEnd = ingestRows[ingestRows.length - 1]
    ? new Date(new Date(ingestRows[ingestRows.length - 1].minute_timestamp).getTime() + MINUTE_MS)
    : options?.toTimestamp
      ? new Date(options.toTimestamp)
      : rangeStart
  const startedAt = startPipelineReconciliation('manual', rangeStart, rangeEnd)

  try {
    clearProjectionTables(options)

    let previousMinuteTimestamp: string | null = null
    let previousAfkStreak = 0

    for (const row of ingestRows) {
      const isContiguousWithPrevious =
        previousMinuteTimestamp !== null &&
        row.minute_timestamp ===
          new Date(new Date(previousMinuteTimestamp).getTime() + MINUTE_MS).toISOString()
      const carriedPreviousAfkStreak = isContiguousWithPrevious
        ? previousAfkStreak
        : getPreviousAfkStreakForRebuild(row.minute_timestamp)

      const payload = deriveMinutePersistencePayload({
        minuteTimestamp: row.minute_timestamp,
        timezoneName: row.timezone_name,
        utcOffsetMinutes: row.utc_offset_minutes,
        windowBucketId: row.source_window_bucket_id,
        afkBucketId: row.source_afk_bucket_id,
        windowEvents: parseStoredEvents<WindowEventData>(
          row.window_events_json,
          row.minute_timestamp,
          'window'
        ),
        afkEvents: parseStoredEvents<AfkEventData>(
          row.afk_events_json,
          row.minute_timestamp,
          'afk'
        ),
        previousAfkStreak: carriedPreviousAfkStreak
      })

      persistMinutePayload(payload, false)
      previousMinuteTimestamp = row.minute_timestamp
      previousAfkStreak = payload.afkStreakMinutes
    }

    completePipelineReconciliation('manual', rangeStart, rangeEnd, startedAt)
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown projection rebuild failure'
    failPipelineReconciliation('manual', rangeStart, rangeEnd, startedAt, errorMessage)
    console.error('[db] Failed to rebuild minutes projection:', error)
  }
}

void rebuildMinutesProjection

async function processMinuteWindow(
  start: Date,
  end: Date,
  windowBucketId: string,
  afkBucketId: string,
  logRecord: boolean
): Promise<boolean> {
  const [windowEvents, afkEvents] = await Promise.all([
    fetchBucketEvents<WindowEventData>(windowBucketId, start, end),
    fetchBucketEvents<AfkEventData>(afkBucketId, start, end)
  ])

  if (!windowEvents || !afkEvents) {
    return false
  }

  const payload = buildMinutePersistencePayload(
    start,
    windowBucketId,
    afkBucketId,
    windowEvents,
    afkEvents
  )
  emitMinutePayload(payload, logRecord)
  return true
}

async function reconcileMinuteRangeInternal(
  referenceEnd: Date,
  logLatestMinute: boolean,
  activeWindowBucketId: string,
  activeAfkBucketId: string
): Promise<boolean> {
  const latestMinuteStart = new Date(referenceEnd.getTime() - MINUTE_MS)
  const rangeStart = getReconciliationRangeStart(referenceEnd)

  for (let cursor = rangeStart.getTime(); cursor < referenceEnd.getTime(); cursor += MINUTE_MS) {
    const minuteStart = new Date(cursor)
    const minuteEnd = new Date(cursor + MINUTE_MS)
    const shouldLog = logLatestMinute && minuteStart.getTime() === latestMinuteStart.getTime()
    const processed = await processMinuteWindow(
      minuteStart,
      minuteEnd,
      activeWindowBucketId,
      activeAfkBucketId,
      shouldLog
    )

    if (!processed) {
      return false
    }
  }

  return true
}

function reconcileMinuteRange(
  referenceEnd: Date,
  logLatestMinute: boolean,
  trigger: PipelineTrigger
): Promise<boolean> {
  if (!windowBucketId || !afkBucketId) {
    return Promise.resolve(false)
  }

  const activeWindowBucketId = windowBucketId
  const activeAfkBucketId = afkBucketId
  const rangeStart = getReconciliationRangeStart(referenceEnd)
  const queuedReconciliation = minuteReconciliationQueue
    .catch(() => false)
    .then(async () => {
      const startedAt = startPipelineReconciliation(trigger, rangeStart, referenceEnd)

      try {
        const reconciled = await reconcileMinuteRangeInternal(
          referenceEnd,
          logLatestMinute,
          activeWindowBucketId,
          activeAfkBucketId
        )

        if (reconciled) {
          completePipelineReconciliation(trigger, rangeStart, referenceEnd, startedAt)
        } else {
          failPipelineReconciliation(
            trigger,
            rangeStart,
            referenceEnd,
            startedAt,
            'Minute reconciliation failed'
          )
        }

        return reconciled
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown reconciliation failure'
        failPipelineReconciliation(trigger, rangeStart, referenceEnd, startedAt, errorMessage)
        console.error('[activitywatch] Failed during reconciliation:', error)
        return false
      }
    })

  minuteReconciliationQueue = queuedReconciliation.catch(() => false)
  return queuedReconciliation
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

    windowBucketId = bucketIds.find((bucketId) => bucketId.includes(AW_WATCHER_WINDOW_NAME)) ?? null
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

    const initialReconciliationEnd = new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
    void reconcileMinuteRange(initialReconciliationEnd, false, 'startup')

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

  const end = new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
  const reconciled = await reconcileMinuteRange(end, true, 'scheduled')
  if (!reconciled) {
    console.warn('ActivityWatch not reachable')
    console.warn('[activitywatch] Minute reconciliation failed. Restarting bucket discovery.')
    restartBucketDiscovery()
  }
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
  ipcMain.handle(PIPELINE_GET_STATUS_CHANNEL, () => getPipelineStatusSnapshot())

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
