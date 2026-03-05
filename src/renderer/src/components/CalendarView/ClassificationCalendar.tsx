import { useMemo } from 'react'
import moment from 'moment'
import { Calendar, momentLocalizer, type Event as BigCalendarEvent } from 'react-big-calendar'
import type { ClassificationEntry } from './types'

const localizer = momentLocalizer(moment)
const MINUTE_MS = 60_000
const CARRY_FORWARD_MS = 15 * MINUTE_MS

interface MinuteClassification {
  startMs: number
  endMs: number
  onGoal: boolean
}

interface ClassificationCalendarEvent extends BigCalendarEvent {
  start: Date
  end: Date
  title: string
  resource: {
    onGoal: boolean
    color: string
  }
}

interface ClassificationCalendarProps {
  classifications: ClassificationEntry[]
}

function buildMinuteMap(classifications: ClassificationEntry[], completedBoundaryMs: number): Map<number, {
  onGoal: boolean
  timestampMs: number
}> {
  const minuteMap = new Map<number, { onGoal: boolean; timestampMs: number }>()

  for (const classification of classifications) {
    const timestampMs = Date.parse(classification.timestamp)
    if (Number.isNaN(timestampMs)) continue

    const attributedMs = timestampMs - 30_000
    const minuteKey = Math.floor(attributedMs / MINUTE_MS) * MINUTE_MS
    if (minuteKey + MINUTE_MS > completedBoundaryMs) continue

    const existing = minuteMap.get(minuteKey)
    if (!existing || timestampMs > existing.timestampMs) {
      minuteMap.set(minuteKey, {
        onGoal: classification.onGoal,
        timestampMs
      })
    }
  }

  return minuteMap
}

function buildMinuteBlocks(classifications: ClassificationEntry[], nowMs: number): MinuteClassification[] {
  const completedBoundaryMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS
  const minuteMap = buildMinuteMap(classifications, completedBoundaryMs)

  if (minuteMap.size === 0) return []

  const firstMinuteMs = Math.min(...minuteMap.keys())
  const minuteBlocks: MinuteClassification[] = []

  let carryForward: { onGoal: boolean; sourceMinuteMs: number } | null = null

  for (let minuteMs = firstMinuteMs; minuteMs < completedBoundaryMs; minuteMs += MINUTE_MS) {
    const direct = minuteMap.get(minuteMs)

    if (direct) {
      carryForward = { onGoal: direct.onGoal, sourceMinuteMs: minuteMs }
      minuteBlocks.push({ startMs: minuteMs, endMs: minuteMs + MINUTE_MS, onGoal: direct.onGoal })
      continue
    }

    if (carryForward && minuteMs - carryForward.sourceMinuteMs <= CARRY_FORWARD_MS) {
      minuteBlocks.push({
        startMs: minuteMs,
        endMs: minuteMs + MINUTE_MS,
        onGoal: carryForward.onGoal
      })
      continue
    }

    carryForward = null
  }

  if (minuteBlocks.length === 0) return []

  const merged: MinuteClassification[] = [minuteBlocks[0]]

  for (let index = 1; index < minuteBlocks.length; index += 1) {
    const current = minuteBlocks[index]
    const previous = merged[merged.length - 1]

    if (previous.onGoal === current.onGoal && previous.endMs === current.startMs) {
      previous.endMs = current.endMs
      continue
    }

    merged.push({ ...current })
  }

  return merged.filter((block) => block.endMs > block.startMs)
}

export default function ClassificationCalendar({
  classifications
}: ClassificationCalendarProps) {
  const calendarEvents = useMemo<ClassificationCalendarEvent[]>(() => {
    const mergedBlocks = buildMinuteBlocks(classifications, Date.now())

    return mergedBlocks.map((block) => ({
      start: new Date(block.startMs),
      end: new Date(block.endMs),
      title: block.onGoal ? 'On Goal' : 'Distracted',
      resource: {
        onGoal: block.onGoal,
        color: block.onGoal ? '#22c55e' : '#ef4444'
      }
    }))
  }, [classifications])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Classification Calendar</h2>
      </div>

      <div className="min-h-0 flex-1 [&_.rbc-time-slot]:min-h-[12px]">
        <Calendar<ClassificationCalendarEvent>
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
