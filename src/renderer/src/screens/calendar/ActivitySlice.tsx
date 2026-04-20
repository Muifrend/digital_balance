import { JSX } from 'react'
import type { ActivitySlice as ActivitySliceType } from '../../../../shared/calendar'
import { isoToMinuteOfDay, minuteToY, type AggregationWindowMinutes } from './TimeGrid'

type ActivitySliceProps = {
  slice: ActivitySliceType
  aggregationMinutes: AggregationWindowMinutes
  onClick: (slice: ActivitySliceType) => void
  selected: boolean
}

function sliceColors(slice: ActivitySliceType): {
  background: string
  borderLeft: string
  borderStyle?: string
} {
  if (slice.kind === 'afk') {
    return { background: 'var(--sage-100)', borderLeft: '3px solid var(--sage-300)' }
  }
  // activity
  if (slice.needsReview) {
    return { background: 'var(--terra-100)', borderLeft: '3px solid var(--terra-300)' }
  }
  if (slice.onTask === true) {
    return { background: 'var(--olive-50)', borderLeft: '3px solid var(--olive-400)' }
  }
  if (slice.onTask === false) {
    return { background: 'var(--amber-100)', borderLeft: '3px solid var(--amber-400)' }
  }
  // unclassified activity
  return { background: 'var(--surface)', borderLeft: '3px solid var(--border2)' }
}

export default function ActivitySlice({
  slice,
  aggregationMinutes,
  onClick,
  selected
}: ActivitySliceProps): JSX.Element {
  const startMin = isoToMinuteOfDay(slice.startAt)
  const durationMin = (new Date(slice.endAt).getTime() - new Date(slice.startAt).getTime()) / 60000
  const top = minuteToY(startMin, aggregationMinutes)
  const height = Math.max(minuteToY(durationMin, aggregationMinutes), 4)

  const { background, borderLeft, borderStyle } = sliceColors(slice)

  const label = slice.kind === 'afk' ? 'AFK' : slice.app ?? '—'
  const showPrimary = height > 16
  const showSecondary = height > 32 && slice.kind === 'activity' && Boolean(slice.title)
  const contentInset = height > 20 ? 2 : 0

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Activity: ${label}`}
      onClick={() => onClick(slice)}
      onKeyDown={(e) => e.key === 'Enter' && onClick(slice)}
      style={{
        position: 'absolute',
        top,
        left: 2,
        right: 2,
        height,
        background,
        borderLeft,
        borderTop: `1px ${borderStyle ?? 'solid'} var(--border)`,
        borderBottom: `1px ${borderStyle ?? 'solid'} var(--border)`,
        borderRight: `1px ${borderStyle ?? 'solid'} var(--border)`,
        borderRadius: 'var(--r-sm)',
        cursor: 'pointer',
        overflow: 'hidden',
        outline: selected ? '2px solid var(--olive-500)' : 'none',
        outlineOffset: 1,
        transition: 'outline 80ms ease-out'
      }}
    >
      {(showPrimary || showSecondary) && (
        <div
          style={{
            position: 'absolute',
            top: contentInset,
            left: 0,
            right: 0,
            bottom: 0,
            padding: '0 6px'
          }}
        >
          {showPrimary && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: slice.kind === 'afk' ? 'var(--sage-500)' : 'var(--text-secondary)',
                display: 'block',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                lineHeight: 1.4
              }}
            >
              {label}
            </span>
          )}
          {showSecondary && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                display: 'block',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                lineHeight: 1.3
              }}
            >
              {slice.title}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
