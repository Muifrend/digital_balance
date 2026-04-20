import {
  CLASSIFIER_VERSION,
  OPENAI_MODEL,
  PROMPT_VERSION,
  buildClassificationRequest,
  getClassificationRetryDelayMs,
  loadOpenAiApiKey,
  parseClassificationResponse,
  type ParsedClassificationResponse
} from '../classification'
import {
  type MinutePersistencePayload,
  type MinuteRecord,
  isClassificationEligible
} from '../pipeline/minute'
import {
  AFK_LOGIC_VERSION,
  CLASSIFICATION_QUEUE_MAX_PENDING,
  CLASSIFIER_QUEUE_VERSION,
  PIPELINE_VERSION,
  REVIEW_FLAG_VERSION
} from './constants'
import {
  type ClassificationJobPayload,
  type ClassificationJobRow,
  type DatabaseContext,
  type DatabaseWriteResult,
  type ExistingClassificationRow,
  type MinuteClassificationRow,
  type NextPendingClassificationJobRow,
  type PendingClassificationCountRow
} from './context'
import { buildGoalVersion, getLocalDateKey, type PlannedContext } from './utils'

export type ClassificationQueue = {
  initialize: (projectRoot: string) => void
  buildClassificationJobPayload: (
    payload: MinutePersistencePayload
  ) => ClassificationJobPayload | null
  prunePendingJobs: () => number
  hasDueClassificationJob: () => boolean
  startClassificationWorker: () => Promise<void>
  setOpenAiApiKey: (apiKey: string | null) => void
  stop: () => void
}

export function createClassificationQueue(
  context: DatabaseContext,
  options: {
    getPlannedContextForTimestamp: (timestamp: string) => PlannedContext | null
    notifyCalendarChanged: (date: string) => void
  }
): ClassificationQueue {
  function buildMinuteRecordFromClassificationRow(row: MinuteClassificationRow): MinuteRecord {
    return {
      timestamp: row.timestamp,
      app: row.app,
      title: row.title,
      dominance: row.dominance,
      afk: row.afk === 1
    }
  }

  function buildClassificationJobPayload(
    payload: MinutePersistencePayload
  ): ClassificationJobPayload | null {
    if (!isClassificationEligible(payload.record, payload.needsReview)) {
      return null
    }

    const plannedContext = options.getPlannedContextForTimestamp(payload.minuteTimestamp)
    if (!plannedContext) {
      return null
    }

    return {
      timestamp: payload.minuteTimestamp,
      planned_block_id: plannedContext.blockId,
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
      classifier_queue_version: CLASSIFIER_QUEUE_VERSION,
      model_name: OPENAI_MODEL,
      prompt_version: PROMPT_VERSION,
      classifier_version: CLASSIFIER_VERSION,
      goal_version: buildGoalVersion({
        taskTitle: plannedContext.taskTitle,
        taskDescription: plannedContext.taskDescription,
        goalSeed: plannedContext.goalSeed,
        projectName: plannedContext.projectName,
        projectDescription: plannedContext.projectDescription
      }),
      goal_title: plannedContext.taskTitle,
      goal_description: plannedContext.taskDescription,
      goal_seed: plannedContext.goalSeed,
      project_name: plannedContext.projectName,
      project_description: plannedContext.projectDescription
    }
  }

  function prunePendingJobs(): number {
    if (!context.prepared) {
      return 0
    }

    const pendingCountRow = context.prepared.countPendingClassificationJobsStatement.get() as
      | PendingClassificationCountRow
      | undefined
    const overflow = Math.max(0, (pendingCountRow?.count ?? 0) - CLASSIFICATION_QUEUE_MAX_PENDING)
    if (overflow === 0) {
      return 0
    }

    const result = context.prepared.prunePendingClassificationJobsStatement.run(
      overflow
    ) as DatabaseWriteResult
    if (result.changes > 0) {
      console.log(`[db] pruned classification queue by ${result.changes} rows`)
    }

    return result.changes
  }

  function hasDueClassificationJob(): boolean {
    if (!context.database || !context.prepared) {
      return false
    }

    const dueJob = context.prepared.selectDueClassificationJobStatement.get() as
      | ClassificationJobRow
      | undefined
    return Boolean(dueJob)
  }

  function clearClassificationRetryTimeout(): void {
    if (context.classificationRetryTimeout) {
      clearTimeout(context.classificationRetryTimeout)
      context.classificationRetryTimeout = null
    }
  }

  function parseSqliteDateTime(value: string): Date | null {
    const parsed = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
    return Number.isNaN(parsed) ? null : new Date(parsed)
  }

  function formatSqliteDateTime(date: Date): string {
    const iso = date.toISOString()
    return iso.slice(0, 19).replace('T', ' ')
  }

  function parseJobPayload(payloadJson: string): ClassificationJobPayload {
    return JSON.parse(payloadJson) as ClassificationJobPayload
  }

  function requestClassification(
    record: MinuteRecord & { app: string },
    payload: ClassificationJobPayload
  ): Promise<ParsedClassificationResponse> {
    if (!context.openAiApiKey) {
      throw new Error('OPENAI_API_KEY missing or blank')
    }

    const { body } = buildClassificationRequest({
      app: record.app,
      title: record.title,
      dominance: record.dominance,
      afk: record.afk,
      goalTitle: payload.goal_title,
      goalDescription: payload.goal_description,
      goalSeed: payload.goal_seed,
      projectName: payload.project_name,
      projectDescription: payload.project_description ?? null
    })

    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.openAiApiKey}`
      },
      body: JSON.stringify(body)
    }).then(async (response) => {
      const responseText = await response.text()
      if (!response.ok) {
        throw new Error(
          `OpenAI returned ${response.status}: ${responseText.slice(0, 300) || 'empty response body'}`
        )
      }

      let responseJson: unknown
      try {
        responseJson = JSON.parse(responseText)
      } catch {
        throw new Error('OpenAI returned invalid JSON for chat completions response')
      }

      const choices = (responseJson as { choices?: Array<{ message?: { content?: unknown } }> })
        .choices
      const content = choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new Error('OpenAI response missing choices[0].message.content')
      }

      const parsedClassification = parseClassificationResponse(content)
      if (!parsedClassification) {
        throw new Error('Failed to parse classification JSON from OpenAI response')
      }

      return parsedClassification
    })
  }

  function markClassificationJobFailed(job: ClassificationJobRow, error: unknown): void {
    if (!context.prepared) {
      return
    }

    const nextAttemptCount = job.attempt_count + 1
    const nextAttemptAt = formatSqliteDateTime(
      new Date(Date.now() + getClassificationRetryDelayMs(nextAttemptCount))
    )
    const errorMessage = error instanceof Error ? error.message : String(error)

    try {
      context.prepared.markClassificationJobFailedStatement.run(
        nextAttemptCount,
        errorMessage,
        nextAttemptAt,
        CLASSIFIER_VERSION,
        PROMPT_VERSION,
        OPENAI_MODEL,
        job.goal_version,
        job.id
      )
      console.warn(`[classify] Failed for ${job.minute_timestamp}: ${errorMessage}`)
    } catch (updateError) {
      console.error(`[classify] Failed to reschedule job ${job.id}:`, updateError)
    }
  }

  function scheduleNextClassificationWorkerRun(): void {
    clearClassificationRetryTimeout()

    if (!context.database || !context.prepared || !context.openAiApiKey) {
      return
    }

    const nextPendingJob = context.prepared.selectNextPendingClassificationJobStatement.get() as
      | NextPendingClassificationJobRow
      | undefined

    if (!nextPendingJob) {
      return
    }

    if (!nextPendingJob.next_attempt_at) {
      queueMicrotask(() => {
        void startClassificationWorker()
      })
      return
    }

    const nextAttemptDate = parseSqliteDateTime(nextPendingJob.next_attempt_at)
    if (!nextAttemptDate) {
      queueMicrotask(() => {
        void startClassificationWorker()
      })
      return
    }

    const delayMs = Math.max(0, nextAttemptDate.getTime() - Date.now())
    context.classificationRetryTimeout = setTimeout(() => {
      context.classificationRetryTimeout = null
      void startClassificationWorker()
    }, delayMs)
  }

  async function startClassificationWorker(): Promise<void> {
    if (context.classifying || !context.database || !context.prepared || !context.openAiApiKey) {
      return
    }

    context.classifying = true
    clearClassificationRetryTimeout()

    try {
      while (context.database && context.prepared && context.openAiApiKey) {
        const job = context.prepared.selectDueClassificationJobStatement.get() as
          | ClassificationJobRow
          | undefined
        if (!job) {
          break
        }

        const claimedJob = context.prepared.markClassificationJobProcessingStatement.run(
          job.id
        ) as DatabaseWriteResult
        if (claimedJob.changes === 0) {
          continue
        }

        try {
          const minuteRow = context.prepared.selectMinuteForClassificationStatement.get(
            job.minute_timestamp
          ) as MinuteClassificationRow | undefined

          if (!minuteRow) {
            context.prepared.deleteClassificationJobByIdStatement.run(job.id)
            continue
          }

          const record = buildMinuteRecordFromClassificationRow(minuteRow)
          if (!isClassificationEligible(record, minuteRow.needs_review === 1)) {
            context.prepared.deleteClassificationJobByIdStatement.run(job.id)
            continue
          }

          const jobPayload = parseJobPayload(job.payload_json)
          const existingClassification = context.prepared.selectExistingClassificationStatement.get(
            minuteRow.timestamp,
            OPENAI_MODEL,
            PROMPT_VERSION,
            CLASSIFIER_VERSION,
            jobPayload.goal_version
          ) as ExistingClassificationRow | undefined

          if (existingClassification) {
            context.prepared.deleteClassificationJobByIdStatement.run(job.id)
            continue
          }

          const classification = await requestClassification(record, jobPayload)
          const insertedClassification = context.prepared.insertClassificationStatement.run(
            minuteRow.id,
            minuteRow.timestamp,
            jobPayload.planned_block_id,
            classification.onTask ? 1 : 0,
            classification.confidence,
            classification.reasoning,
            OPENAI_MODEL,
            PROMPT_VERSION,
            CLASSIFIER_VERSION,
            jobPayload.goal_version,
            jobPayload.goal_title,
            jobPayload.goal_description ?? ''
          ) as DatabaseWriteResult

          context.prepared.deleteClassificationJobByIdStatement.run(job.id)

          if (insertedClassification.changes > 0) {
            console.log(
              `[classify] ${minuteRow.timestamp} -> on_task: ${classification.onTask} (confidence: ${classification.confidence.toFixed(2)}) - ${classification.reasoning ?? 'No reasoning provided'}`
            )
            options.notifyCalendarChanged(getLocalDateKey(minuteRow.timestamp))
          }
        } catch (error) {
          markClassificationJobFailed(job, error)
        }
      }
    } finally {
      context.classifying = false

      if (hasDueClassificationJob()) {
        queueMicrotask(() => {
          void startClassificationWorker()
        })
      } else {
        scheduleNextClassificationWorkerRun()
      }
    }
  }

  function initialize(projectRoot: string): void {
    if (!context.prepared) {
      return
    }

    const resetProcessingJobsResult =
      context.prepared.resetProcessingClassificationJobsStatement.run() as DatabaseWriteResult
    if (resetProcessingJobsResult.changes > 0) {
      console.log(
        `[db] reset ${resetProcessingJobsResult.changes} stale classification jobs to pending`
      )
    }

    context.openAiApiKey = loadOpenAiApiKey(projectRoot)
    if (!context.openAiApiKey) {
      console.warn('[classify] OPENAI_API_KEY missing or blank. Classification disabled.')
    }

    prunePendingJobs()
  }

  function setOpenAiApiKey(apiKey: string | null): void {
    const normalized = apiKey && apiKey.trim().length > 0 ? apiKey.trim() : null
    context.openAiApiKey = normalized
    if (normalized) {
      queueMicrotask(() => {
        void startClassificationWorker()
      })
    } else {
      clearClassificationRetryTimeout()
    }
  }

  function stop(): void {
    clearClassificationRetryTimeout()
    context.classifying = false
  }

  return {
    initialize,
    buildClassificationJobPayload,
    prunePendingJobs,
    setOpenAiApiKey,
    hasDueClassificationJob,
    startClassificationWorker,
    stop
  }
}
