import { JSX } from 'react'
import type { DayTotals } from '../../../../shared/analytics'
import { formatHm, formatPercent } from './format'

type OnTaskHeroProps = {
  totals: DayTotals
}

export default function OnTaskHero({ totals }: OnTaskHeroProps): JSX.Element {
  const { trackedMinutes, onTaskMinutes, offTaskMinutes, untrackedMinutes } = totals
  const hasClassified = onTaskMinutes + offTaskMinutes > 0
  const onTaskPct = hasClassified
    ? Math.round((onTaskMinutes / (onTaskMinutes + offTaskMinutes)) * 100)
    : 0

  const onTaskWidth = trackedMinutes > 0 ? (onTaskMinutes / trackedMinutes) * 100 : 0
  const offTaskWidth = trackedMinutes > 0 ? (offTaskMinutes / trackedMinutes) * 100 : 0
  const untrackedWidth = trackedMinutes > 0 ? (untrackedMinutes / trackedMinutes) * 100 : 0

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '20px 24px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 14
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 42,
              fontWeight: 400,
              color: 'var(--text-primary)',
              lineHeight: 1
            }}
          >
            {hasClassified ? `${onTaskPct}%` : '—'}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginTop: 4
            }}
          >
            On-task
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
          <div>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {formatHm(trackedMinutes)}
            </strong>{' '}
            tracked
          </div>
          <div style={{ marginTop: 2 }}>
            <strong style={{ color: 'var(--olive-500)', fontWeight: 500 }}>
              {formatHm(onTaskMinutes)}
            </strong>{' '}
            on-task ·{' '}
            <strong style={{ color: 'var(--amber-400)', fontWeight: 500 }}>
              {formatHm(offTaskMinutes)}
            </strong>{' '}
            off-task
          </div>
        </div>
      </div>

      {trackedMinutes > 0 ? (
        <div
          style={{
            display: 'flex',
            height: 14,
            borderRadius: 'var(--r-sm)',
            overflow: 'hidden',
            background: 'var(--bg2)'
          }}
          title={`On-task ${formatPercent(onTaskMinutes, trackedMinutes)} · Off-task ${formatPercent(offTaskMinutes, trackedMinutes)} · Untracked ${formatPercent(untrackedMinutes, trackedMinutes)}`}
        >
          {onTaskWidth > 0 && (
            <div style={{ width: `${onTaskWidth}%`, background: 'var(--olive-400)' }} />
          )}
          {offTaskWidth > 0 && (
            <div style={{ width: `${offTaskWidth}%`, background: 'var(--amber-300)' }} />
          )}
          {untrackedWidth > 0 && (
            <div style={{ width: `${untrackedWidth}%`, background: 'var(--sage-200)' }} />
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
          No tracked activity for this day yet.
        </p>
      )}
    </section>
  )
}
