import { JSX, useEffect, useState } from 'react'

function App(): JSX.Element {
  const [latestEvent, setLatestEvent] = useState<ActivityWatchEvent | null>(null)

  useEffect(() => {
    let isMounted = true

    void window.api.getLatestActivityWatchEvent().then((event) => {
      if (isMounted && event) {
        setLatestEvent(event)
      }
    })

    const unsubscribe = window.api.onLatestActivityWatchEvent((event) => {
      setLatestEvent(event)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">FocusLens Event Stream</h1>
      {latestEvent ? (
        <pre className="mt-4 overflow-auto rounded bg-slate-100 p-4 text-sm">
          {JSON.stringify(latestEvent, null, 2)}
        </pre>
      ) : (
        <p className="mt-4 text-slate-600">No ActivityWatch window events received yet.</p>
      )}
    </main>
  )
}

export default App
