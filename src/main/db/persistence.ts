import type { ClassificationQueue } from './classification-queue'
import { AFK_LOGIC_VERSION, PIPELINE_VERSION, REVIEW_FLAG_VERSION } from './constants'
import {
  type DatabaseContext,
  type DatabaseWriteResult,
  type ExistingClassificationRow,
  type MinuteRowLookup,
  type PersistMinutePayloadResult,
  type PreviousAfkStreakRow
} from './context'
import { getLocalDateKey } from './utils'
import { type MinutePersistencePayload } from '../pipeline/minute'

const MINUTE_MS = 60_000

export type DatabasePersistence = {
  persistMinutePayload: (payload: MinutePersistencePayload, logDatabase: boolean) => void
  getPreviousAfkStreak: (minuteTimestamp: string) => number
}

export function createPersistence(
  context: DatabaseContext,
  classificationQueue: Pick<
    ClassificationQueue,
    | 'buildClassificationJobPayload'
    | 'prunePendingJobs'
    | 'hasDueClassificationJob'
    | 'startClassificationWorker'
  >,
  notifyCalendarChanged: (date: string) => void
): DatabasePersistence {
  const transaction =
    context.database && context.prepared
      ? context.database.transaction(
          (payload: MinutePersistencePayload, logDatabase: boolean): PersistMinutePayloadResult => {
            if (!context.prepared) {
              throw new Error('Database statements not prepared')
            }

            const shouldProjectMinute = payload.status === 'winner' && payload.record !== null

            const existingMinute = shouldProjectMinute
              ? ((context.prepared.selectMinuteIdStatement.get(payload.minuteTimestamp) as
                  | MinuteRowLookup
                  | undefined) ?? null)
              : null

            const projectedRecord = shouldProjectMinute ? payload.record : null
            const upsertedMinute = shouldProjectMinute
              ? (context.prepared.upsertMinuteStatement.run(
                  payload.minuteTimestamp,
                  payload.timezoneName,
                  payload.utcOffsetMinutes,
                  projectedRecord!.app,
                  projectedRecord!.title,
                  projectedRecord!.dominance,
                  projectedRecord!.afk ? 1 : 0,
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

            context.prepared.upsertMinuteIngestStatement.run(
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

            const classificationJobPayload =
              classificationQueue.buildClassificationJobPayload(payload)
            const currentMinute = shouldProjectMinute
              ? ((context.prepared.selectMinuteIdStatement.get(payload.minuteTimestamp) as
                  | MinuteRowLookup
                  | undefined) ?? null)
              : null
            const existingClassification =
              currentMinute && classificationJobPayload
                ? ((context.prepared.selectExistingClassificationStatement.get(
                    payload.minuteTimestamp,
                    classificationJobPayload.model_name,
                    classificationJobPayload.prompt_version,
                    classificationJobPayload.classifier_version,
                    classificationJobPayload.goal_version
                  ) as ExistingClassificationRow | undefined) ?? null)
                : null
            let queuedClassificationJob = false

            if (classificationJobPayload && currentMinute && !existingClassification) {
              context.prepared.upsertClassificationJobStatement.run(
                payload.minuteTimestamp,
                JSON.stringify(classificationJobPayload),
                classificationJobPayload.classifier_version,
                classificationJobPayload.prompt_version,
                classificationJobPayload.model_name,
                classificationJobPayload.goal_version
              )
              classificationQueue.prunePendingJobs()
              queuedClassificationJob = true
            } else {
              context.prepared.deleteClassificationJobStatement.run(payload.minuteTimestamp)
            }

            if (!shouldProjectMinute) {
              context.prepared.deleteMinuteStatement.run(payload.minuteTimestamp)
              return { queuedClassificationJob }
            }

            if (logDatabase) {
              if (existingMinute) {
                console.log(
                  `[db] updated minute ${payload.minuteTimestamp} (id: ${existingMinute.id})`
                )
              } else {
                console.log(
                  `[db] inserted minute ${payload.minuteTimestamp} (id: ${String(upsertedMinute?.lastInsertRowid ?? 'unknown')})`
                )
              }
            }

            return { queuedClassificationJob }
          }
        )
      : null

  function getPreviousAfkStreak(minuteTimestamp: string): number {
    if (!context.prepared) {
      return 0
    }

    const previousMinuteTimestamp = new Date(
      new Date(minuteTimestamp).getTime() - MINUTE_MS
    ).toISOString()
    const previousRow = context.prepared.selectPreviousAfkStreakStatement.get(
      previousMinuteTimestamp
    ) as PreviousAfkStreakRow | undefined

    return previousRow?.afk_streak_minutes ?? 0
  }

  function persistMinutePayload(payload: MinutePersistencePayload, logDatabase: boolean): void {
    if (!context.database || !context.prepared || !transaction) {
      return
    }

    try {
      const result = transaction(payload, logDatabase)
      notifyCalendarChanged(getLocalDateKey(payload.minuteTimestamp))
      if (result.queuedClassificationJob || classificationQueue.hasDueClassificationJob()) {
        void classificationQueue.startClassificationWorker()
      }
    } catch (error) {
      console.error(`[db] Failed to persist minute payload ${payload.minuteTimestamp}:`, error)
    }
  }

  return {
    persistMinutePayload,
    getPreviousAfkStreak
  }
}
