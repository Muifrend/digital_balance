import { JSX, useEffect, useState } from 'react'
import { createInitialPipelineStatus, type PipelineStatus } from '../../shared/pipeline'
import AnalyticsScreen from './screens/analytics/AnalyticsScreen'
import CalendarScreen from './screens/calendar/CalendarScreen'
import FriendsScreen from './screens/friends/FriendsScreen'
import ProjectsScreen from './screens/projects/ProjectsScreen'
import TopNav, { type NavSection } from './shell/TopNav'

function App(): JSX.Element {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(
    createInitialPipelineStatus()
  )
  const [section, setSection] = useState<NavSection>('calendar')

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav active={section} onChange={setSection} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {section === 'calendar' && <CalendarScreen pipelineStatus={pipelineStatus} />}
        {section === 'projects' && <ProjectsScreen />}
        {section === 'analytics' && <AnalyticsScreen />}
        {section === 'friends' && <FriendsScreen />}
      </div>
    </div>
  )
}

export default App
