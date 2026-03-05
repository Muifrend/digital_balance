import { useMemo } from 'react'
import moment from 'moment'
import { Calendar, momentLocalizer, type Event as BigCalendarEvent } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import type { ActivityEvent } from './types'

const localizer = momentLocalizer(moment)
const MINUTE_MS = 60_000

interface ActivitySegment {
  startMs: number
  endMs: number
  app: string
  appKey: string
}

interface MinuteWinner {
  startMs: number
  endMs: number
  app: string
  appKey: string
}

interface ActivityCalendarEvent extends BigCalendarEvent {
  start: Date
  end: Date
  title: string
  resource: {
    appKey: string
    color: string
  }
}

interface ActivityCalendarProps {
  events: ActivityEvent[]
}

function appToColor(app: string): string {
  let hash = 0
  for (let i = 0; i < app.length; i++) {
    hash = app.charCodeAt(i) + ((hash << 5) - hash)
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 50%)`
}

function buildSegments(events: ActivityEvent[]): ActivitySegment[] {
  if (events.length === 0) return []

  const sortedEvents = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  const segments: ActivitySegment[] = []

  for (let index = 0; index < sortedEvents.length; index += 1) {
    const current = sortedEvents[index]
    const startMs = Date.parse(current.timestamp)
    if (Number.isNaN(startMs)) continue

    let endMs = startMs + Math.max(0, current.duration) * 1000
    if (index < sortedEvents.length - 1) {
      const nextStartMs = Date.parse(sortedEvents[index + 1].timestamp)
      if (!Number.isNaN(nextStartMs)) {
        endMs = nextStartMs
      }
    }

    if (endMs <= startMs) continue

    const appName = current.data.app.trim() || 'Unknown'
    segments.push({
      startMs,
      endMs,
      app: appName,
      appKey: appName.toLowerCase()
    })
  }

  return segments
}

function buildMinuteWinners(segments: ActivitySegment[], nowMs: number): MinuteWinner[] {
  if (segments.length === 0) return []

  const completedBoundaryMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS
  const firstBucketMs = Math.floor(segments[0].startMs / MINUTE_MS) * MINUTE_MS
  const lastSegmentEndMs = segments[segments.length - 1].endMs
  const loopEndMs = Math.min(
    completedBoundaryMs,
    Math.ceil(lastSegmentEndMs / MINUTE_MS) * MINUTE_MS
  )

  if (loopEndMs <= firstBucketMs) return []

  const winners: MinuteWinner[] = []

  for (let bucketStartMs = firstBucketMs; bucketStartMs < loopEndMs; bucketStartMs += MINUTE_MS) {
    const bucketEndMs = bucketStartMs + MINUTE_MS
    if (bucketEndMs > nowMs) continue

    const totals = new Map<string, { app: string; totalMs: number }>()

    for (const segment of segments) {
      if (segment.startMs >= bucketEndMs || segment.endMs <= bucketStartMs) continue

      const contributionMs =
        Math.min(segment.endMs, bucketEndMs) - Math.max(segment.startMs, bucketStartMs)
      if (contributionMs <= 0) continue

      const existing = totals.get(segment.appKey)
      if (existing) {
        existing.totalMs += contributionMs
      } else {
        totals.set(segment.appKey, { app: segment.app, totalMs: contributionMs })
      }
    }

    if (totals.size === 0) continue

    let winnerKey = ''
    let winnerApp = ''
    let winnerTotalMs = -1

    for (const [appKey, value] of totals.entries()) {
      const shouldReplace =
        value.totalMs > winnerTotalMs ||
        (value.totalMs === winnerTotalMs && value.app.localeCompare(winnerApp) < 0)

      if (shouldReplace) {
        winnerKey = appKey
        winnerApp = value.app
        winnerTotalMs = value.totalMs
      }
    }

    if (!winnerKey) continue

    winners.push({
      startMs: bucketStartMs,
      endMs: bucketEndMs,
      app: winnerApp,
      appKey: winnerKey
    })
  }

  return winners
}

function mergeMinuteWinners(winners: MinuteWinner[]): MinuteWinner[] {
  if (winners.length === 0) return []

  const merged: MinuteWinner[] = [winners[0]]

  for (let index = 1; index < winners.length; index += 1) {
    const current = winners[index]
    const previous = merged[merged.length - 1]

    if (previous.appKey === current.appKey && previous.endMs === current.startMs) {
      previous.endMs = current.endMs
      continue
    }

    merged.push({ ...current })
  }

  return merged.filter((block) => block.endMs > block.startMs)
}

export default function ActivityCalendar({ events }: ActivityCalendarProps) {
  const calendarEvents = useMemo<ActivityCalendarEvent[]>(() => {
    const segments = buildSegments(events)
    const winners = buildMinuteWinners(segments, Date.now())
    const merged = mergeMinuteWinners(winners)

    return merged.map((block) => ({
      start: new Date(block.startMs),
      end: new Date(block.endMs),
      title: block.app,
      resource: {
        appKey: block.appKey,
        color: appToColor(block.app)
      }
    }))
  }, [events])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Activity Calendar</h2>
      </div>

      <div className="min-h-0 flex-1 [&_.rbc-time-slot]:min-h-[12px]">
        <Calendar<ActivityCalendarEvent>
          localizer={localizer}
          events={calendarEvents}
          defaultView="day"
          views={['day']}
          toolbar={false}
          step={1}
          timeslots={1}
          defaultDate={new Date()}
          scrollToTime={new Date(Date.now() - 30 * MINUTE_MS)}
          startAccessor="start"
          endAccessor="end"
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.resource.color,
              borderColor: event.resource.color,
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '12px'
            }
          })}
        />
      </div>
    </div>
  )
}
