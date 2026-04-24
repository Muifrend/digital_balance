import { JSX, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createInitialPipelineStatus, type PipelineStatus } from '../../shared/pipeline'
import AnalyticsScreen from './screens/analytics/AnalyticsScreen'
import CalendarScreen from './screens/calendar/CalendarScreen'
import FriendsScreen from './screens/friends/FriendsScreen'
import ProjectsScreen from './screens/projects/ProjectsScreen'
import SettingsScreen from './screens/settings/SettingsScreen'
import DemoOverlay from './shell/DemoOverlay'
import { demoSteps } from './shell/demoSteps'
import TopNav, { type NavSection } from './shell/TopNav'

function App(): JSX.Element {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(
    createInitialPipelineStatus()
  )
  const [section, setSection] = useState<NavSection>('calendar')
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [demoStepIndex, setDemoStepIndex] = useState(0)
  const [returnSection, setReturnSection] = useState<NavSection | null>(null)

  const activeDemoStep = useMemo(
    () => demoSteps[Math.max(0, Math.min(demoStepIndex, demoSteps.length - 1))],
    [demoStepIndex]
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

  useLayoutEffect(() => {
    if (!isDemoOpen) return
    const targetSection = activeDemoStep.section
    if (targetSection && section !== targetSection) {
      setSection(targetSection)
    }
  }, [activeDemoStep, isDemoOpen, section])

  const handleOpenDemo = useCallback(() => {
    setReturnSection(section)
    setDemoStepIndex(0)
    setIsDemoOpen(true)
  }, [section])

  const handleCloseDemo = useCallback(() => {
    const originSection = returnSection
    setIsDemoOpen(false)
    setDemoStepIndex(0)
    if (originSection) setSection(originSection)
    setReturnSection(null)
  }, [returnSection])

  const handleNextDemoStep = useCallback(() => {
    setDemoStepIndex((current) => Math.min(current + 1, demoSteps.length - 1))
  }, [])

  const handlePreviousDemoStep = useCallback(() => {
    setDemoStepIndex((current) => Math.max(current - 1, 0))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav active={section} onChange={setSection} onOpenDemo={handleOpenDemo} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {section === 'calendar' && <CalendarScreen pipelineStatus={pipelineStatus} />}
        {section === 'projects' && <ProjectsScreen />}
        {section === 'analytics' && <AnalyticsScreen />}
        {section === 'friends' && <FriendsScreen />}
        {section === 'settings' && <SettingsScreen />}
      </div>
      <DemoOverlay
        open={isDemoOpen}
        step={activeDemoStep}
        stepIndex={demoStepIndex}
        totalSteps={demoSteps.length}
        onBack={handlePreviousDemoStep}
        onNext={handleNextDemoStep}
        onClose={handleCloseDemo}
      />
    </div>
  )
}

export default App
