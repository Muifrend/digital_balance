import Database from 'better-sqlite3'
import { type ColumnInfoRow, type MigrationRow } from './context'

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
    goal_version TEXT,
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

const CREATE_CLASSIFICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_id INTEGER NOT NULL REFERENCES minutes(id),
    minute_timestamp TEXT NOT NULL,
    on_task INTEGER NOT NULL,
    confidence REAL NOT NULL,
    reasoning TEXT,
    corrected INTEGER DEFAULT 0,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    classifier_version TEXT NOT NULL,
    goal_version TEXT NOT NULL,
    goal_title TEXT NOT NULL,
    goal_description TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`

const CREATE_CLASSIFICATIONS_MINUTE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_classifications_minute_created
  ON classifications(minute_id, created_at);
`

const CREATE_CLASSIFICATIONS_VERSION_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_minute_version
  ON classifications(minute_id, model_name, prompt_version, classifier_version, goal_version, corrected);
`

const CREATE_CLASSIFICATIONS_TIMESTAMP_VERSION_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_classifications_timestamp_version
  ON classifications(minute_timestamp, model_name, prompt_version, classifier_version, goal_version, corrected);
`

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

export function runDatabaseMigrations(databaseInstance: Database.Database): void {
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
        databaseInstance.exec(
          "UPDATE minutes SET updated_at = datetime('now') WHERE updated_at IS NULL"
        )
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
    },
    {
      id: 5,
      name: 'create_classifications_table',
      run: (): void => {
        databaseInstance.exec(CREATE_CLASSIFICATIONS_TABLE_SQL)
        databaseInstance.exec(CREATE_CLASSIFICATIONS_MINUTE_INDEX_SQL)
        databaseInstance.exec(CREATE_CLASSIFICATIONS_VERSION_INDEX_SQL)
        databaseInstance.exec(CREATE_CLASSIFICATIONS_TIMESTAMP_VERSION_INDEX_SQL)
      }
    },
    {
      id: 6,
      name: 'expand_classification_jobs_table',
      run: (): void => {
        addColumnIfMissing(databaseInstance, 'classification_jobs', 'goal_version', 'TEXT')
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
