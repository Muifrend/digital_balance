import { useMemo, type JSX, type RefObject } from 'react'
import moment from 'moment'
import { Calendar, Views, momentLocalizer } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import type { ActivityEvent } from './types'

interface ActivityCalendarProps {
  activities: ActivityEvent[]
  date: Date
  onNavigate: (date: Date) => void
  containerRef: RefObject<HTMLDivElement | null>
}

interface CalendarEvent {
  start: Date
  end: Date
  title: string
  resource: ActivityEvent
}

const localizer = momentLocalizer(moment)

function toMinuteEpoch(timestamp: string): number | null {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return null
  return Math.floor(parsed / 60_000) * 60_000
}

function durationValue(duration: number): number {
  return Number.isFinite(duration) ? duration : 0
}

function bucketByMinute(activities: ActivityEvent[]): CalendarEvent[] {
  const dominantByMinute = new Map<number, ActivityEvent>()

  for (const activity of activities) {
    const minuteEpoch = toMinuteEpoch(activity.timestamp)
    if (minuteEpoch === null) continue

    const existing = dominantByMinute.get(minuteEpoch)
    if (!existing) {
      dominantByMinute.set(minuteEpoch, activity)
      continue
    }

    const existingDuration = durationValue(existing.duration)
    const candidateDuration = durationValue(activity.duration)
    if (candidateDuration > existingDuration) {
      dominantByMinute.set(minuteEpoch, activity)
      continue
    }

    if (candidateDuration === existingDuration) {
      const existingTime = Date.parse(existing.timestamp)
      const candidateTime = Date.parse(activity.timestamp)
      if (!Number.isNaN(candidateTime) && candidateTime >= existingTime) {
        dominantByMinute.set(minuteEpoch, activity)
      }
    }
  }

  const minuteEvents = Array.from(dominantByMinute.entries())
    .sort(([leftEpoch], [rightEpoch]) => leftEpoch - rightEpoch)
    .map(([minuteEpoch, dominantEvent]) => ({
      start: new Date(minuteEpoch),
      end: new Date(minuteEpoch + 60_000),
      title: dominantEvent.app,
      resource: dominantEvent
    }))

  if (minuteEvents.length === 0) return []

  const merged: CalendarEvent[] = [minuteEvents[0]]
  for (let index = 1; index < minuteEvents.length; index += 1) {
    const current = minuteEvents[index]
    const previous = merged[merged.length - 1]
    const isConsecutiveMinute = previous.end.getTime() === current.start.getTime()
    const sameApp = previous.resource.app === current.resource.app

    if (isConsecutiveMinute && sameApp) {
      previous.end = current.end
    } else {
      merged.push(current)
    }
  }

  return merged
}

function appColor(appName: string): string {
  let hash = 0
  for (let index = 0; index < appName.length; index += 1) {
    hash = (hash << 5) - hash + appName.charCodeAt(index)
    hash |= 0
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 70% 45%)`
}

export default function ActivityCalendar({
  activities,
  date,
  onNavigate,
  containerRef
}: ActivityCalendarProps): JSX.Element {
  const events = useMemo(() => bucketByMinute(activities), [activities])
  const scrollToTime = new Date()
  scrollToTime.setMinutes(scrollToTime.getMinutes() - 30)

  return (
    <section ref={containerRef} className="flex-1 h-full border-r border-gray-200 p-3 box-border">
      <div className="h-full overflow-y-auto">
        <div className="[&_.rbc-time-slot]:min-h-[12px] [&_.rbc-time-slot]:max-h-[12px] [&_.rbc-event]:text-xs [&_.rbc-event]:py-0 [&_.rbc-event]:px-1 overflow-hidden h-full">
          <Calendar<CalendarEvent>
            localizer={localizer}
            date={date}
            onNavigate={onNavigate}
            events={events}
            defaultView={Views.DAY}
            views={[Views.DAY]}
            step={1}
            timeslots={1}
            scrollToTime={scrollToTime}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            eventPropGetter={(event) => {
              const background = appColor(event.resource.app || 'unknown')
              return {
                style: {
                  backgroundColor: background,
                  borderColor: background
                }
              }
            }}
          />
        </div>
      </div>
    </section>
  )
}
