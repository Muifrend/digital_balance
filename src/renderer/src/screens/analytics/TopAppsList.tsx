import { JSX, useMemo } from 'react'
import type { AppBreakdownEntry } from '../../../../shared/analytics'
import StackedBarRow from './StackedBarRow'

type TopAppsListProps = {
  apps: AppBreakdownEntry[]
}

const MAX_ROWS = 8

export default function TopAppsList({ apps }: TopAppsListProps): JSX.Element {
  const rows = useMemo(() => {
    if (apps.length <= MAX_ROWS) return apps
    const top = apps.slice(0, MAX_ROWS - 1)
    const rest = apps.slice(MAX_ROWS - 1)
    const otherTotal = rest.reduce(
      (acc, entry) => ({
        totalMinutes: acc.totalMinutes + entry.totalMinutes,
        onTaskMinutes: acc.onTaskMinutes + entry.onTaskMinutes,
        offTaskMinutes: acc.offTaskMinutes + entry.offTaskMinutes,
        untrackedMinutes: acc.untrackedMinutes + entry.untrackedMinutes
      }),
      { totalMinutes: 0, onTaskMinutes: 0, offTaskMinutes: 0, untrackedMinutes: 0 }
    )
    return [
      ...top,
      {
        app: `Other (${rest.length})`,
        ...otherTotal
      }
    ]
  }, [apps])

  const rowMax = rows.reduce((m, r) => Math.max(m, r.totalMinutes), 0)

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '18px 24px'
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          margin: '0 0 14px'
        }}
      >
        Top apps
      </h2>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
          No app activity tracked for this day.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => (
            <StackedBarRow
              key={row.app}
              label={row.app}
              totalMinutes={row.totalMinutes}
              rowMaxMinutes={rowMax}
              segments={[
                { value: row.onTaskMinutes, color: 'var(--olive-400)', label: 'On-task' },
                { value: row.offTaskMinutes, color: 'var(--amber-300)', label: 'Off-task' },
                { value: row.untrackedMinutes, color: 'var(--sage-200)', label: 'Untracked' }
              ]}
            />
          ))}
        </div>
      )}
    </section>
  )
}
