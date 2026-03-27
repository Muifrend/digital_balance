import {
  type AfkEventData,
  type RebuildMinutesProjectionOptions,
  type WindowEventData,
  deriveMinutePersistencePayload,
  getAfkDurationSeconds,
  getExpectedPreviousMinuteTimestamp,
  isAfkWindowActive,
  parseStoredEvents
} from '../pipeline/minute'
import type { DatabasePersistence } from './persistence'
import {
  type DatabaseContext,
  type MinuteIngestProjectionRow,
  type PreviousMinuteIngestAfkRow
} from './context'

const MINUTE_MS = 60_000

export type ProjectionRebuild = {
  rebuildMinutesProjection: (options?: RebuildMinutesProjectionOptions) => void
}

export function createProjectionRebuild(
  context: DatabaseContext,
  persistence: Pick<DatabasePersistence, 'persistMinutePayload'>
): ProjectionRebuild {
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

  function getPreviousAfkStreakForRebuild(minuteTimestamp: string): number {
    if (!context.database) {
      return 0
    }

    const previousRows = context.database
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
    if (!context.database) {
      return
    }

    const minutesRange = buildTimestampRangeClause('timestamp', options)
    if (minutesRange.clause) {
      context.database
        .prepare(`DELETE FROM minutes ${minutesRange.clause}`)
        .run(...minutesRange.params)
    } else {
      context.database.prepare('DELETE FROM minutes').run()
    }

    const jobsRange = buildTimestampRangeClause('minute_timestamp', options)
    if (jobsRange.clause) {
      context.database
        .prepare(`DELETE FROM classification_jobs ${jobsRange.clause}`)
        .run(...jobsRange.params)
    } else {
      context.database.prepare('DELETE FROM classification_jobs').run()
    }
  }

  function relinkClassificationsToCurrentMinutes(options?: RebuildMinutesProjectionOptions): void {
    if (!context.database) {
      return
    }

    const range = buildTimestampRangeClause('minute_timestamp', options)
    const deleteClause = range.clause
      ? `${range.clause} AND NOT EXISTS (
          SELECT 1
          FROM minutes
          WHERE minutes.timestamp = classifications.minute_timestamp
        )`
      : `WHERE NOT EXISTS (
          SELECT 1
          FROM minutes
          WHERE minutes.timestamp = classifications.minute_timestamp
        )`

    context.database.prepare(`DELETE FROM classifications ${deleteClause}`).run(...range.params)

    const updateClause = range.clause
      ? `${range.clause} AND EXISTS (
          SELECT 1
          FROM minutes
          WHERE minutes.timestamp = classifications.minute_timestamp
        )`
      : `WHERE EXISTS (
          SELECT 1
          FROM minutes
          WHERE minutes.timestamp = classifications.minute_timestamp
        )`

    context.database
      .prepare(
        `
          UPDATE classifications
          SET minute_id = (
            SELECT id
            FROM minutes
            WHERE minutes.timestamp = classifications.minute_timestamp
          )
          ${updateClause}
        `
      )
      .run(...range.params)
  }

  function rebuildMinutesProjection(options?: RebuildMinutesProjectionOptions): void {
    if (!context.database) {
      return
    }

    try {
      const range = buildTimestampRangeClause('minute_timestamp', options)
      const ingestRows = context.database
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

        persistence.persistMinutePayload(payload, false)
        previousMinuteTimestamp = row.minute_timestamp
        previousAfkStreak = payload.afkStreakMinutes
      }

      relinkClassificationsToCurrentMinutes(options)
    } catch (error) {
      console.error('[db] Failed to rebuild minutes projection:', error)
    }
  }

  return {
    rebuildMinutesProjection
  }
}
