import { useEffect, useRef, useState, type JSX } from 'react'
import ActivityList from './ActivityList'
import TimelineCalendar from './TimelineCalendar'
import type { ActivityEvent, ClassificationEntry } from './types'

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

export default function CalendarView(): JSX.Element {
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [classifications, setClassifications] = useState<ClassificationEntry[]>([])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    void Promise.all([
      window.api.getClassificationHistory(),
      window.api.getLatestActivityWatchEvent()
    ]).then(([history, latestEvent]) => {
      if (!isMountedRef.current) return
      setClassifications(history)

      if (latestEvent) {
        setActivities([toActivityEvent(latestEvent)])
      }
    })

    const unsubscribeClassification = window.api.onLatestClassification(() => {
      void window.api.getClassificationHistory().then((history) => {
        if (!isMountedRef.current) return
        setClassifications(history)
      })
    })

    const unsubscribeActivity = window.api.onLatestActivityWatchEvent((event) => {
      setActivities((previous) => [toActivityEvent(event), ...previous])
    })

    return () => {
      isMountedRef.current = false
      unsubscribeClassification()
      unsubscribeActivity()
    }
  }, [])

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'row' }}>
      <ActivityList activities={activities} classifications={classifications} />
      <TimelineCalendar classifications={classifications} />
    </main>
  )
}
