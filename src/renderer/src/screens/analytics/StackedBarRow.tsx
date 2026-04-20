import { JSX } from 'react'
import { formatHm } from './format'

type Segment = {
  value: number
  color: string
  label: string
}

type StackedBarRowProps = {
  label: string
  accent?: string | null
  segments: Segment[]
  rowMaxMinutes: number
  totalMinutes: number
}

export default function StackedBarRow({
  label,
  accent,
  segments,
  rowMaxMinutes,
  totalMinutes
}: StackedBarRowProps): JSX.Element {
  const rowWidthPct = rowMaxMinutes > 0 ? (totalMinutes / rowMaxMinutes) * 100 : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 72px', gap: 12, alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0
        }}
      >
        {accent && (
          <span
            style={{
              flexShrink: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent
            }}
          />
        )}
        <span
          style={{
            fontSize: 13,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={label}
        >
          {label}
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          height: 12,
          borderRadius: 'var(--r-sm)',
          background: 'var(--bg2)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex',
            height: '100%',
            width: `${Math.max(0, rowWidthPct)}%`,
            minWidth: totalMinutes > 0 ? 2 : 0
          }}
          title={segments
            .filter((s) => s.value > 0)
            .map((s) => `${s.label}: ${formatHm(s.value)}`)
            .join(' · ')}
        >
          {segments.map((segment, index) => {
            const segWidth = totalMinutes > 0 ? (segment.value / totalMinutes) * 100 : 0
            if (segWidth <= 0) return null
            return (
              <div
                key={index}
                style={{
                  width: `${segWidth}%`,
                  background: segment.color
                }}
              />
            )
          })}
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {formatHm(totalMinutes)}
      </div>
    </div>
  )
}
