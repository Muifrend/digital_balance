import { useEffect, useRef, useState, type JSX } from 'react'
import ActivityCalendar from './ActivityCalendar'
import ClassificationCalendar from './ClassificationCalendar'
import type { ActivityEvent, ClassificationEntry } from './types'

interface TimelineCalendarProps {
  classifications: ClassificationEntry[]
}

let generatedActivityId = 1

function toActivityEvent(event: ActivityWatchEvent): ActivityEvent {
  const rawId = (event as { id?: unknown }).id
  const fallbackId = generatedActivityId
  generatedActivityId += 1

  return {
    id: typeof rawId === 'number' ? rawId : fallbackId,
    timestamp: event.timestamp,
    app: event.data.app ?? '',
    title: event.data.title ?? '',
    duration: event.duration
  }
}

function dedupeActivities(activities: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>()
  const output: ActivityEvent[] = []

  for (const activity of activities) {
    const key = `${activity.id}|${activity.timestamp}|${activity.app}|${activity.title}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(activity)
  }

  return output
}

export default function TimelineCalendar({ classifications }: TimelineCalendarProps): JSX.Element {
  const [date, setDate] = useState<Date>(new Date())
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const activityContainerRef = useRef<HTMLDivElement | null>(null)
  const classificationContainerRef = useRef<HTMLDivElement | null>(null)
  const isSyncingScrollRef = useRef(false)

  useEffect(() => {
    let mounted = true

    void window.api.getLatestActivityWatchEvent().then((event) => {
      if (!mounted || !event) return
      setActivities((previous) => dedupeActivities([toActivityEvent(event), ...previous]))
    })

    const unsubscribe = window.api.onLatestActivityWatchEvent((event) => {
      setActivities((previous) => dedupeActivities([toActivityEvent(event), ...previous]))
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const timer = setTimeout(() => {
      const leftScroller = activityContainerRef.current?.querySelector(
        '.rbc-time-content'
      ) as HTMLElement | null
      const rightScroller = classificationContainerRef.current?.querySelector(
        '.rbc-time-content'
      ) as HTMLElement | null

      if (!leftScroller || !rightScroller) return

      const sync = (source: HTMLElement, target: HTMLElement): void => {
        if (isSyncingScrollRef.current) return
        isSyncingScrollRef.current = true
        target.scrollTop = source.scrollTop
        requestAnimationFrame(() => {
          isSyncingScrollRef.current = false
        })
      }

      const onLeftScroll = (): void => sync(leftScroller, rightScroller)
      const onRightScroll = (): void => sync(rightScroller, leftScroller)

      leftScroller.addEventListener('scroll', onLeftScroll)
      rightScroller.addEventListener('scroll', onRightScroll)
      rightScroller.scrollTop = leftScroller.scrollTop

      cleanup = () => {
        leftScroller.removeEventListener('scroll', onLeftScroll)
        rightScroller.removeEventListener('scroll', onRightScroll)
      }
    }, 0)

    return () => {
      clearTimeout(timer)
      cleanup?.()
    }
  }, [])

  return (
    <section style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'row' }}>
      <ActivityCalendar
        activities={activities}
        date={date}
        onNavigate={setDate}
        containerRef={activityContainerRef}
      />
      <ClassificationCalendar
        classifications={classifications}
        date={date}
        onNavigate={setDate}
        containerRef={classificationContainerRef}
      />
    </section>
  )
}

