import { JSX, useEffect, useState } from 'react'

function App(): JSX.Element {
  const [latestEvent, setLatestEvent] = useState<ActivityWatchEvent | null>(null)
  const [latestClassification, setLatestClassification] = useState<ClassificationResult | null>(null)
  const [goals, setGoals] = useState<string[]>([])
  const [goalInput, setGoalInput] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    void Promise.all([
      window.api.getLatestActivityWatchEvent(),
      window.api.getLatestClassification(),
      window.api.getGoals()
    ]).then(([event, classification, loadedGoals]) => {
        if (!isMounted) return

        if (event) {
          setLatestEvent(event)
        }
        if (classification) {
          setLatestClassification(classification)
        }

        setGoals(loadedGoals)
        setGoalInput(loadedGoals[0] ?? '')
      }
    )

    const unsubscribeEvents = window.api.onLatestActivityWatchEvent((event) => {
      setLatestEvent(event)
    })
    const unsubscribeClassification = window.api.onLatestClassification((classification) => {
      setLatestClassification(classification)
    })

    return () => {
      isMounted = false
      unsubscribeEvents()
      unsubscribeClassification()
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

      <section>
        <h2>Latest Classification</h2>
        <p>App: {latestEvent?.data.app ?? 'Unknown'}</p>
        <p>Window Title: {latestEvent?.data.title ?? 'Unknown'}</p>
        {latestClassification ? (
          <>
            <p>Status: {latestClassification.onGoal ? '🟢 On Goal' : '🔴 Off Goal'}</p>
            <p>Confidence: {latestClassification.confidence.toFixed(2)}</p>
            <p>Reasoning: {latestClassification.reasoning}</p>
          </>
        ) : (
          <p>No classification yet.</p>
        )}
      </section>
    </main>
  )
}

export default App
