import Database from 'better-sqlite3'

export type DatabaseWriteResult = {
  changes: number
  lastInsertRowid: number | bigint
}

export type MigrationRow = {
  id: number
}

export type ColumnInfoRow = {
  name: string
}

export type MinuteRowLookup = {
  id: number
}

export type MinuteClassificationRow = {
  id: number
  timestamp: string
  app: string | null
  title: string | null
  dominance: number | null
  afk: number
  needs_review: number
}

export type PreviousAfkStreakRow = {
  afk_streak_minutes: number | null
}

export type PendingClassificationCountRow = {
  count: number
}

export type ClassificationJobRow = {
  id: number
  minute_timestamp: string
  attempt_count: number
}

export type ExistingClassificationRow = {
  id: number
}

export type NextPendingClassificationJobRow = {
  next_attempt_at: string | null
}

export type MinuteIngestProjectionRow = {
  minute_timestamp: string
  timezone_name: string
  utc_offset_minutes: number
  source_window_bucket_id: string | null
  source_afk_bucket_id: string | null
  window_events_json: string
  afk_events_json: string
}

export type PreviousMinuteIngestAfkRow = {
  minute_timestamp: string
  afk_events_json: string
}

export type ClassificationJobPayload = {
  timestamp: string
  timezone_name: string
  utc_offset_minutes: number
  app: string | null
  title: string | null
  dominance: number | null
  afk: boolean
  needs_review: boolean
  needs_review_reasons: string[]
  summary_status: string
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
  model_name: string
  prompt_version: string
  classifier_version: string
  goal_version: string
  goal_title: string
  goal_description: string
}

export type PersistMinutePayloadResult = {
  queuedClassificationJob: boolean
}

export type PreparedStatements = {
  upsertMinuteStatement: Database.Statement
  upsertMinuteIngestStatement: Database.Statement
  upsertClassificationJobStatement: Database.Statement
  deleteMinuteStatement: Database.Statement
  deleteClassificationJobStatement: Database.Statement
  deleteClassificationJobByIdStatement: Database.Statement
  selectMinuteIdStatement: Database.Statement
  selectMinuteForClassificationStatement: Database.Statement
  selectPreviousAfkStreakStatement: Database.Statement
  countPendingClassificationJobsStatement: Database.Statement
  prunePendingClassificationJobsStatement: Database.Statement
  resetProcessingClassificationJobsStatement: Database.Statement
  selectDueClassificationJobStatement: Database.Statement
  selectNextPendingClassificationJobStatement: Database.Statement
  markClassificationJobProcessingStatement: Database.Statement
  markClassificationJobFailedStatement: Database.Statement
  selectExistingClassificationStatement: Database.Statement
  insertClassificationStatement: Database.Statement
}

export type DatabaseContext = {
  database: Database.Database | null
  prepared: PreparedStatements | null
  openAiApiKey: string | null
  classifying: boolean
  classificationRetryTimeout: NodeJS.Timeout | null
}

export function createDatabaseContext(): DatabaseContext {
  return {
    database: null,
    prepared: null,
    openAiApiKey: null,
    classifying: false,
    classificationRetryTimeout: null
  }
}
