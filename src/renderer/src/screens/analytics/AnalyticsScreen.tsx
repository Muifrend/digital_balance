import { JSX, useCallback, useState } from 'react'
import DateNavigator from '../calendar/DateNavigator'
import OnTaskHero from './OnTaskHero'
import ProjectBreakdown from './ProjectBreakdown'
import TopAppsList from './TopAppsList'
import WeekStrip from './WeekStrip'
import { useAnalyticsData } from './useAnalyticsData'

function todayIso(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-')
}

function addDays(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day + delta)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-')
}

export default function AnalyticsScreen(): JSX.Element {
  const [date, setDate] = useState(todayIso)
  const { day, week, loading, error } = useAnalyticsData(date)

  const goToDate = useCallback((d: string) => setDate(d), [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1
            }}
          >
            Analytics
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              margin: '4px 0 0',
              lineHeight: 1.3
            }}
          >
            How your day broke down between on-task and off-task activity.
          </p>
        </div>

        <div style={{ flex: 1 }} />

        <DateNavigator
          date={date}
          onPrev={() => goToDate(addDays(date, -1))}
          onNext={() => goToDate(addDays(date, 1))}
          onToday={() => goToDate(todayIso())}
        />
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 48px' }}>
        {error && (
          <p style={{ color: 'var(--terra-500)', fontSize: 13 }}>
            Failed to load analytics: {error}
          </p>
        )}

        {loading && !day && !week && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {week && <WeekStrip days={week.days} selectedDate={date} onSelect={goToDate} />}
          {day && <OnTaskHero totals={day.totals} />}
          {day && <TopAppsList apps={day.apps} />}
          {day && <ProjectBreakdown projects={day.projects} />}
        </div>
      </div>
    </div>
  )
}
