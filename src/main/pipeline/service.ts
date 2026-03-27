import {
  createInitialPipelineStatus,
  type PipelineStatus,
  type PipelineTrigger
} from '../../shared/pipeline'
import type { ActivityWatchService, BucketPair } from '../activitywatch/service'
import type { DatabaseService } from '../db/service'
import {
  MINUTE_MS,
  type ActivityWatchEvent,
  type AfkEventData,
  type MinutePersistencePayload,
  type WindowEventData,
  deriveMinutePersistencePayload,
  getTimezoneSnapshot
} from './minute'

const ACTIVITYWATCH_RETRY_MS = 5_000
const RECONCILIATION_LOOKBACK_MINUTES = 5

export type PipelineService = {
  start: () => Promise<void>
  reconcileNow: (trigger: PipelineTrigger) => Promise<boolean>
  getStatusSnapshot: () => PipelineStatus
  stop: () => void
}

export function createPipelineService(options: {
  database: DatabaseService
  activityWatch: ActivityWatchService
  onStatusChange: (status: PipelineStatus) => void
}): PipelineService {
  let bucketDiscoveryTimeout: NodeJS.Timeout | null = null
  let minuteStartTimeout: NodeJS.Timeout | null = null
  let minuteInterval: NodeJS.Timeout | null = null
  let isDiscoveringBuckets = false
  let activeBuckets: BucketPair | null = null
  let minuteReconciliationQueue: Promise<boolean> = Promise.resolve(true)
  let pipelineStatus: PipelineStatus = createInitialPipelineStatus()
  let started = false

  function getStatusSnapshot(): PipelineStatus {
    return { ...pipelineStatus }
  }

  function setPipelineStatus(status: PipelineStatus): void {
    pipelineStatus = status
    options.onStatusChange(getStatusSnapshot())
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

  function scheduleBucketDiscovery(delayMs = 0): void {
    if (bucketDiscoveryTimeout) {
      clearTimeout(bucketDiscoveryTimeout)
    }

    bucketDiscoveryTimeout = setTimeout(() => {
      bucketDiscoveryTimeout = null
      void discoverActivityWatchBuckets()
    }, delayMs)
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

  function scheduleActivityWatchRecovery(delayMs = ACTIVITYWATCH_RETRY_MS): void {
    activeBuckets = null
    stopMinuteScheduler()

    void options.activityWatch.startOnLaunch().finally(() => {
      scheduleBucketDiscovery(delayMs)
    })
  }

  function restartBucketDiscovery(): void {
    scheduleActivityWatchRecovery(ACTIVITYWATCH_RETRY_MS)
  }

  function emitMinutePayload(payload: MinutePersistencePayload, logRecord: boolean): void {
    if (payload.record && logRecord) {
      console.log(JSON.stringify(payload.record))
    }

    if (!payload.record && payload.status === 'no_winner' && logRecord) {
      console.log('[activitywatch] no winner found, skipping minute')
    }

    options.database.persistMinutePayload(payload, logRecord)
  }

  function buildMinutePersistencePayload(
    start: Date,
    buckets: BucketPair,
    windowEvents: ActivityWatchEvent<WindowEventData>[],
    afkEvents: ActivityWatchEvent<AfkEventData>[]
  ): MinutePersistencePayload {
    const minuteTimestamp = start.toISOString()
    const timezoneSnapshot = getTimezoneSnapshot(start)

    return deriveMinutePersistencePayload({
      minuteTimestamp,
      timezoneName: timezoneSnapshot.timezoneName,
      utcOffsetMinutes: timezoneSnapshot.utcOffsetMinutes,
      windowBucketId: buckets.windowBucketId,
      afkBucketId: buckets.afkBucketId,
      windowEvents,
      afkEvents,
      previousAfkStreak: options.database.getPreviousAfkStreak(minuteTimestamp)
    })
  }

  async function processMinuteWindow(
    start: Date,
    end: Date,
    buckets: BucketPair,
    logRecord: boolean
  ): Promise<boolean> {
    const [windowEvents, afkEvents] = await Promise.all([
      options.activityWatch.fetchBucketEvents<WindowEventData>(buckets.windowBucketId, start, end),
      options.activityWatch.fetchBucketEvents<AfkEventData>(buckets.afkBucketId, start, end)
    ])

    if (!windowEvents || !afkEvents) {
      return false
    }

    const payload = buildMinutePersistencePayload(start, buckets, windowEvents, afkEvents)
    emitMinutePayload(payload, logRecord)
    return true
  }

  async function reconcileMinuteRangeInternal(
    referenceEnd: Date,
    logLatestMinute: boolean,
    buckets: BucketPair
  ): Promise<boolean> {
    const latestMinuteStart = new Date(referenceEnd.getTime() - MINUTE_MS)
    const rangeStart = getReconciliationRangeStart(referenceEnd)

    for (let cursor = rangeStart.getTime(); cursor < referenceEnd.getTime(); cursor += MINUTE_MS) {
      const minuteStart = new Date(cursor)
      const minuteEnd = new Date(cursor + MINUTE_MS)
      const shouldLog = logLatestMinute && minuteStart.getTime() === latestMinuteStart.getTime()
      const processed = await processMinuteWindow(minuteStart, minuteEnd, buckets, shouldLog)

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
    if (!activeBuckets) {
      return Promise.resolve(false)
    }

    const buckets = activeBuckets
    const rangeStart = getReconciliationRangeStart(referenceEnd)
    const queuedReconciliation = minuteReconciliationQueue
      .catch(() => false)
      .then(async () => {
        const startedAt = startPipelineReconciliation(trigger, rangeStart, referenceEnd)

        try {
          const reconciled = await reconcileMinuteRangeInternal(
            referenceEnd,
            logLatestMinute,
            buckets
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
      const buckets = await options.activityWatch.discoverBuckets()
      if (!buckets) {
        scheduleActivityWatchRecovery(ACTIVITYWATCH_RETRY_MS)
        return
      }

      activeBuckets = buckets
      const initialReconciliationEnd = new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
      void reconcileMinuteRange(initialReconciliationEnd, false, 'startup')

      startMinuteScheduler()
    } finally {
      isDiscoveringBuckets = false
    }
  }

  async function tickMinute(): Promise<void> {
    if (!activeBuckets) {
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

  async function start(): Promise<void> {
    if (started) {
      return
    }

    started = true
    void options.activityWatch.startOnLaunch().finally(() => {
      scheduleBucketDiscovery()
    })
  }

  function stop(): void {
    started = false
    activeBuckets = null

    if (bucketDiscoveryTimeout) {
      clearTimeout(bucketDiscoveryTimeout)
      bucketDiscoveryTimeout = null
    }

    stopMinuteScheduler()
    options.activityWatch.stop()
  }

  return {
    start,
    reconcileNow: (trigger) => {
      const end = new Date(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
      return reconcileMinuteRange(end, trigger === 'scheduled', trigger)
    },
    getStatusSnapshot,
    stop
  }
}
