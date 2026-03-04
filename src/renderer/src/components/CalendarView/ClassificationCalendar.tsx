import { useMemo, type JSX, type RefObject } from 'react'
import moment from 'moment'
import { Calendar, Views, momentLocalizer } from 'react-big-calendar'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import type { ClassificationEntry } from './types'

interface ClassificationCalendarProps {
  classifications: ClassificationEntry[]
  date: Date
  onNavigate: (date: Date) => void
  containerRef: RefObject<HTMLDivElement | null>
}

interface CalendarEvent {
  start: Date
  end: Date
  title: string
  resource: ClassificationEntry
}

const localizer = momentLocalizer(moment)
const CLASSIFICATION_ATTRIBUTION_OFFSET_MS = 30_000

function toAttributedMinuteEpoch(timestamp: string): number | null {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return null
  const attributedTime = parsed - CLASSIFICATION_ATTRIBUTION_OFFSET_MS
  return Math.floor(attributedTime / 60_000) * 60_000
}

function bucketClassifications(classifications: ClassificationEntry[]): CalendarEvent[] {
  const byMinute = new Map<number, ClassificationEntry>()

  for (const classification of classifications) {
    const minuteEpoch = toAttributedMinuteEpoch(classification.timestamp)
    if (minuteEpoch === null) continue

    const existing = byMinute.get(minuteEpoch)
    if (!existing || Date.parse(classification.timestamp) >= Date.parse(existing.timestamp)) {
      byMinute.set(minuteEpoch, classification)
    }
  }

  const minuteEvents = Array.from(byMinute.entries())
    .sort(([leftEpoch], [rightEpoch]) => leftEpoch - rightEpoch)
    .map(([minuteEpoch, classification]) => ({
      start: new Date(minuteEpoch),
      end: new Date(minuteEpoch + 60_000),
      title: classification.app,
      resource: classification
    }))

  if (minuteEvents.length === 0) return []

  const merged: CalendarEvent[] = [minuteEvents[0]]
  for (let index = 1; index < minuteEvents.length; index += 1) {
    const current = minuteEvents[index]
    const previous = merged[merged.length - 1]
    const isConsecutiveMinute = previous.end.getTime() === current.start.getTime()
    const sameOnGoal = previous.resource.onGoal === current.resource.onGoal

    if (isConsecutiveMinute && sameOnGoal) {
      previous.end = current.end
    } else {
      merged.push(current)
    }
  }

  return merged.filter((event) => event.end.getTime() > event.start.getTime())
}

export default function ClassificationCalendar({
  classifications,
  date,
  onNavigate,
  containerRef
}: ClassificationCalendarProps): JSX.Element {
  const events = useMemo(() => bucketClassifications(classifications), [classifications])
  const scrollToTime = new Date()
  scrollToTime.setMinutes(scrollToTime.getMinutes() - 30)

  return (
    <section ref={containerRef} className="flex-1 h-full p-3 box-border">
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
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: event.resource.onGoal ? '#22c55e' : '#ef4444',
                borderColor: event.resource.onGoal ? '#22c55e' : '#ef4444'
              }
            })}
          />
        </div>
      </div>
    </section>
  )
}
