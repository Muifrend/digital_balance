export const MINUTE_MS = 60_000
const AFK_WINDOW_ACTIVE_THRESHOLD_SECONDS = 50
const AFK_STREAK_THRESHOLD_MINUTES = 3

export type ActivityWatchEvent<TData extends Record<string, unknown>> = {
  timestamp: string
  duration: number
  data: TData
}

export type WindowEventData = {
  app?: string
  title?: string
}

export type AfkEventData = {
  status?: string
}

export type MinuteRecord = {
  timestamp: string
  app: string | null
  title: string | null
  dominance: number | null
  afk: boolean
}

export type MinuteStatus = 'winner' | 'empty_window' | 'no_winner'

export type WinnerSummary = {
  app: string
  title: string | null
  duration: number
  latestTimestampMs: number
  latestTimestampIso: string | null
}

export type ReviewAssessment = {
  needsReview: boolean
  reasons: string[]
}

export type TimezoneSnapshot = {
  timezoneName: string
  utcOffsetMinutes: number
}

export type MinuteDerivationInput = {
  minuteTimestamp: string
  timezoneName: string
  utcOffsetMinutes: number
  windowBucketId: string | null
  afkBucketId: string | null
  windowEvents: ActivityWatchEvent<WindowEventData>[]
  afkEvents: ActivityWatchEvent<AfkEventData>[]
  previousAfkStreak: number
}

export type RebuildMinutesProjectionOptions = {
  fromTimestamp?: string
  toTimestamp?: string
}

export type MinutePersistencePayload = {
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

export function assessNeedsReview(record: MinuteRecord): ReviewAssessment {
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

export function getAfkDurationSeconds(afkEvents: ActivityWatchEvent<AfkEventData>[]): number {
  return afkEvents.reduce((total, event) => {
    return event.data.status === 'afk' ? total + event.duration : total
  }, 0)
}

export function isAfkWindowActive(afkDurationSeconds: number): boolean {
  return afkDurationSeconds > AFK_WINDOW_ACTIVE_THRESHOLD_SECONDS
}

export function getAfkStreakMinutes(previousAfkStreak: number, afkWindowActive: boolean): number {
  return afkWindowActive ? previousAfkStreak + 1 : 0
}

export function getDominance(durationSeconds: number): number {
  return Number(Math.max(0, Math.min(durationSeconds / 60, 1)).toFixed(2))
}

export function isClassificationEligible(
  record: MinuteRecord | null,
  needsReview: boolean
): record is MinuteRecord & { app: string } {
  return Boolean(record && record.app !== null && !record.afk && !needsReview)
}

export function getTimezoneSnapshot(date: Date): TimezoneSnapshot {
  return {
    timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    utcOffsetMinutes: -date.getTimezoneOffset()
  }
}

export function parseStoredEvents<TData extends Record<string, unknown>>(
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

export function getExpectedPreviousMinuteTimestamp(minuteTimestamp: string): string {
  return new Date(new Date(minuteTimestamp).getTime() - MINUTE_MS).toISOString()
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

export function deriveMinutePersistencePayload(
  input: MinuteDerivationInput
): MinutePersistencePayload {
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
