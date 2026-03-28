import { JSX } from 'react'
import type { AggregationWindowMinutes } from '../../../../shared/calendar'

const OPTIONS: AggregationWindowMinutes[] = [1, 5, 10, 15, 30, 60]

type AggregationPickerProps = {
  value: AggregationWindowMinutes
  onChange: (minutes: AggregationWindowMinutes) => void
}

export default function AggregationPicker({ value, onChange }: AggregationPickerProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Activity aggregation window"
      style={{
        display: 'flex',
        gap: 2,
        background: 'var(--bg3)',
        padding: 3,
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border)'
      }}
    >
      {OPTIONS.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            aria-pressed={active}
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              color: active ? '#fff' : 'var(--text-secondary)',
              background: active ? 'var(--olive-500)' : 'transparent',
              transition: 'background 120ms ease-out, color 120ms ease-out',
              whiteSpace: 'nowrap'
            }}
          >
            {opt}m
          </button>
        )
      })}
    </div>
  )
}
