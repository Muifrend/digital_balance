import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import ActivityCalendar from './ActivityCalendar'
import ActivityList from './ActivityList'
import ClassificationCalendar from './ClassificationCalendar'
import type { ActivityEvent, ClassificationEntry as CalendarClassificationEntry } from './types'

function normalizeActivityEvent(event: ActivityWatchEvent | null): ActivityEvent | null {
  if (!event || typeof event.id !== 'number') return null

  const timestamp = typeof event.timestamp === 'string' ? event.timestamp : ''
  const duration = typeof event.duration === 'number' ? event.duration : 0
  const app = typeof event.data?.app === 'string' ? event.data.app : 'Unknown'
  const title = typeof event.data?.title === 'string' ? event.data.title : ''

  if (!timestamp) return null

  return {
    id: event.id,
    timestamp,
    duration,
    data: {
      app,
      title
    }
  }
}

function normalizeClassification(entry: Partial<CalendarClassificationEntry>):
  | CalendarClassificationEntry
  | null {
  if (!entry || typeof entry.timestamp !== 'string') return null

  return {
    timestamp: entry.timestamp,
    app: typeof entry.app === 'string' ? entry.app : 'Unknown',
    title: typeof entry.title === 'string' ? entry.title : '',
    onGoal: Boolean(entry.onGoal),
    confidence: typeof entry.confidence === 'number' ? entry.confidence : 0,
    reasoning: typeof entry.reasoning === 'string' ? entry.reasoning : ''
  }
}

function upsertEvent(
  setRawEvents: Dispatch<SetStateAction<ActivityEvent[]>>,
  incoming: ActivityEvent
): void {
  setRawEvents((previous) => {
    const idx = previous.findIndex((event) => event.id === incoming.id)
    if (idx >= 0) {
      const updated = [...previous]
      updated[idx] = incoming
      return updated
    }

    return [...previous, incoming]
  })
}

export default function CalendarView() {
  const [rawEvents, setRawEvents] = useState<ActivityEvent[]>([])
  const [rawClassifications, setRawClassifications] = useState<CalendarClassificationEntry[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [goalInput, setGoalInput] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    void Promise.all([
      window.api.getLatestActivityWatchEvent(),
      window.api.getClassificationHistory(),
      window.api.getGoals()
    ]).then(([latestEvent, history, loadedGoals]) => {
      if (!isMounted) return

      const normalizedEvent = normalizeActivityEvent(latestEvent)
      if (normalizedEvent) {
        setRawEvents([normalizedEvent])
      }

      const normalizedHistory = history
        .map((entry) => normalizeClassification(entry))
        .filter((entry): entry is CalendarClassificationEntry => entry !== null)
      setRawClassifications(normalizedHistory)

      setGoals(loadedGoals)
      setGoalInput(loadedGoals[0] ?? '')
    })

    const unsubscribeLatestEvent = window.api.onLatestActivityWatchEvent((event) => {
      const normalizedEvent = normalizeActivityEvent(event)
      if (!normalizedEvent) return
      upsertEvent(setRawEvents, normalizedEvent)
    })

    const unsubscribeHeartbeat = window.api.onActivityWatchHeartbeat((event) => {
      const normalizedEvent = normalizeActivityEvent(event)
      if (!normalizedEvent) return
      upsertEvent(setRawEvents, normalizedEvent)
    })

    const unsubscribeLatestClassification = window.api.onLatestClassification((entry) => {
      const normalizedEntry = normalizeClassification(entry)
      if (!normalizedEntry) return

      setRawClassifications((previous) => [...previous, normalizedEntry])
    })

    return () => {
      isMounted = false
      unsubscribeLatestEvent()
      unsubscribeHeartbeat()
      unsubscribeLatestClassification()
    }
  }, [])

  const handleSaveGoal = async (): Promise<void> => {
    const nextGoals = goalInput.trim() ? [goalInput.trim()] : []
    const savedGoals = await window.api.setGoals(nextGoals)
    setGoals(savedGoals)
    setGoalInput(savedGoals[0] ?? '')
    setSaveMessage('Saved.')
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">FocusLens</h1>
          <p className="text-sm text-slate-600">Current goal: {goals[0] ?? 'None set'}</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={goalInput}
            onChange={(event) => {
              setGoalInput(event.target.value)
              if (saveMessage) setSaveMessage('')
            }}
            placeholder="Enter your weekly goal"
            className="w-full max-w-xl rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void handleSaveGoal()}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Save Goal
          </button>
          {saveMessage && <p className="text-xs text-emerald-600">{saveMessage}</p>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[280px] border-r border-slate-200 bg-white">
          <ActivityList events={rawEvents} />
        </aside>

        <section className="min-w-0 flex-1 border-r border-slate-200 bg-white">
          <ActivityCalendar events={rawEvents} />
        </section>

        <section className="min-w-0 flex-1 bg-white">
          <ClassificationCalendar classifications={rawClassifications} />
        </section>
      </div>
    </div>
  )
}
