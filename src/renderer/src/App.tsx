import { JSX, useEffect, useState } from 'react'

function App(): JSX.Element {
  const [latestEvent, setLatestEvent] = useState<ActivityWatchEvent | null>(null)
  const [goals, setGoals] = useState<string[]>([])
  const [goalInput, setGoalInput] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    void Promise.all([window.api.getLatestActivityWatchEvent(), window.api.getGoals()]).then(
      ([event, loadedGoals]) => {
        if (!isMounted) return

        if (event) {
          setLatestEvent(event)
        }

        setGoals(loadedGoals)
        setGoalInput(loadedGoals[0] ?? '')
      }
    )

    const unsubscribe = window.api.onLatestActivityWatchEvent((event) => {
      setLatestEvent(event)
    })

    return () => {
      isMounted = false
      unsubscribe()
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
    <main>
      <h1>FocusLens</h1>

      <section>
        <h2>Weekly Goal</h2>
        <p>Current goal: {goals[0] ?? 'None set'}</p>
        <input
          type="text"
          value={goalInput}
          onChange={(event) => {
            setGoalInput(event.target.value)
            if (saveMessage) setSaveMessage('')
          }}
          placeholder="Enter your weekly goal"
        />
        <button type="button" onClick={() => void handleSaveGoal()}>
          Save Goal
        </button>
        {saveMessage && <p>{saveMessage}</p>}
      </section>

      <section>
        <h2>Latest ActivityWatch Event</h2>
        {latestEvent ? <pre>{JSON.stringify(latestEvent, null, 2)}</pre> : <p>No events yet.</p>}
      </section>
    </main>
  )
}

export default App
