import Database from 'better-sqlite3'
import type { DatabaseContext, PreparedStatements } from './context'

export function prepareStatements(database: Database.Database): PreparedStatements {
  return {
    upsertMinuteStatement: database.prepare(`
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
    `),
    upsertMinuteIngestStatement: database.prepare(`
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
    `),
    upsertClassificationJobStatement: database.prepare(`
      INSERT INTO classification_jobs (
        minute_timestamp,
        status,
        attempt_count,
        payload_json,
        classifier_version,
        prompt_version,
        model_name,
        goal_version,
        last_error,
        next_attempt_at,
        updated_at
      )
      VALUES (?, 'pending', 0, ?, ?, ?, ?, ?, NULL, NULL, datetime('now'))
      ON CONFLICT(minute_timestamp) DO UPDATE SET
        status = 'pending',
        attempt_count = 0,
        payload_json = excluded.payload_json,
        classifier_version = excluded.classifier_version,
        prompt_version = excluded.prompt_version,
        model_name = excluded.model_name,
        goal_version = excluded.goal_version,
        last_error = NULL,
        next_attempt_at = NULL,
        updated_at = datetime('now')
    `),
    deleteMinuteStatement: database.prepare('DELETE FROM minutes WHERE timestamp = ?'),
    deleteClassificationJobStatement: database.prepare(
      'DELETE FROM classification_jobs WHERE minute_timestamp = ?'
    ),
    deleteClassificationJobByIdStatement: database.prepare(
      'DELETE FROM classification_jobs WHERE id = ?'
    ),
    selectMinuteIdStatement: database.prepare('SELECT id FROM minutes WHERE timestamp = ?'),
    selectMinuteForClassificationStatement: database.prepare(`
      SELECT id, timestamp, app, title, dominance, afk, needs_review
      FROM minutes
      WHERE timestamp = ?
    `),
    selectPreviousAfkStreakStatement: database.prepare(
      'SELECT afk_streak_minutes FROM minute_ingest WHERE minute_timestamp = ?'
    ),
    countPendingClassificationJobsStatement: database.prepare(
      "SELECT COUNT(*) as count FROM classification_jobs WHERE status = 'pending'"
    ),
    prunePendingClassificationJobsStatement: database.prepare(`
      DELETE FROM classification_jobs
      WHERE id IN (
        SELECT id
        FROM classification_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC, id ASC
        LIMIT ?
      )
    `),
    resetProcessingClassificationJobsStatement: database.prepare(`
      UPDATE classification_jobs
      SET status = 'pending',
          next_attempt_at = NULL,
          updated_at = datetime('now')
      WHERE status = 'processing'
    `),
    selectDueClassificationJobStatement: database.prepare(`
      SELECT id, minute_timestamp, attempt_count
      FROM classification_jobs
      WHERE status = 'pending'
        AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
      ORDER BY
        CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END ASC,
        next_attempt_at ASC,
        created_at ASC,
        id ASC
      LIMIT 1
    `),
    selectNextPendingClassificationJobStatement: database.prepare(`
      SELECT next_attempt_at
      FROM classification_jobs
      WHERE status = 'pending'
      ORDER BY
        CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END ASC,
        next_attempt_at ASC,
        created_at ASC,
        id ASC
      LIMIT 1
    `),
    markClassificationJobProcessingStatement: database.prepare(`
      UPDATE classification_jobs
      SET status = 'processing',
          updated_at = datetime('now')
      WHERE id = ?
        AND status = 'pending'
    `),
    markClassificationJobFailedStatement: database.prepare(`
      UPDATE classification_jobs
      SET status = 'pending',
          attempt_count = ?,
          last_error = ?,
          next_attempt_at = ?,
          classifier_version = ?,
          prompt_version = ?,
          model_name = ?,
          goal_version = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `),
    selectExistingClassificationStatement: database.prepare(`
      SELECT id
      FROM classifications
      WHERE minute_timestamp = ?
        AND model_name = ?
        AND prompt_version = ?
        AND classifier_version = ?
        AND goal_version = ?
        AND corrected = 0
      LIMIT 1
    `),
    insertClassificationStatement: database.prepare(`
      INSERT OR IGNORE INTO classifications (
        minute_id,
        minute_timestamp,
        on_task,
        confidence,
        reasoning,
        corrected,
        model_name,
        prompt_version,
        classifier_version,
        goal_version,
        goal_title,
        goal_description
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `)
  }
}

export function resetPreparedState(context: DatabaseContext): void {
  context.prepared = null
}
