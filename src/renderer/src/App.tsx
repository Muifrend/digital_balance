import { JSX, useEffect, useState } from 'react'
import { createInitialPipelineStatus, type PipelineStatus } from '../../shared/pipeline'
import CalendarScreen from './screens/calendar/CalendarScreen'

function App(): JSX.Element {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(
    createInitialPipelineStatus()
  )

  useEffect(() => {
    let isMounted = true

    void window.api.pipeline
      .getStatus()
      .then((status) => {
        if (isMounted) setPipelineStatus(status)
      })
      .catch((error) => {
        console.error('[pipeline] Failed to read initial status:', error)
      })

    const unsubscribe = window.api.pipeline.onStatus((status) => {
      setPipelineStatus(status)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return <CalendarScreen pipelineStatus={pipelineStatus} />
}

export default App
