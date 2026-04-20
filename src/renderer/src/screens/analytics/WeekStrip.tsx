import { JSX } from 'react'
import type { WeekDayEntry } from '../../../../shared/analytics'
import { formatHm } from './format'

type WeekStripProps = {
  days: WeekDayEntry[]
  selectedDate: string
  onSelect: (date: string) => void
}

const BAR_HEIGHT = 72

function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function weekdayLabel(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString('en-US', { weekday: 'short' })
}

function dayNumberLabel(isoDate: string): string {
  return String(parseLocalDate(isoDate).getDate())
}

export default function WeekStrip({ days, selectedDate, onSelect }: WeekStripProps): JSX.Element {
  const maxOnTask = days.reduce((m, d) => Math.max(m, d.onTaskMinutes), 0)

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '14px 20px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            margin: 0
          }}
        >
          Past 7 days · on-task hours
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, 1fr)`,
          gap: 10,
          alignItems: 'end'
        }}
      >
        {days.map((day) => {
          const ratio = maxOnTask > 0 ? day.onTaskMinutes / maxOnTask : 0
          const height = Math.max(day.onTaskMinutes > 0 ? 4 : 2, Math.round(ratio * BAR_HEIGHT))
          const isSelected = day.date === selectedDate
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelect(day.date)}
              title={`${formatHm(day.onTaskMinutes)} on-task · ${formatHm(day.offTaskMinutes)} off-task`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)'
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: BAR_HEIGHT,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center'
                }}
              >
                <div
                  style={{
                    width: '70%',
                    height,
                    background: isSelected ? 'var(--olive-500)' : 'var(--olive-300)',
                    borderRadius: 4,
                    transition: 'background 120ms ease-out'
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: isSelected ? 'var(--olive-600)' : 'var(--text-tertiary)'
                }}
              >
                {weekdayLabel(day.date)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {dayNumberLabel(day.date)}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
