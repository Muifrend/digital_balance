import { JSX } from 'react'
import type { ActivitySlice as ActivitySliceType } from '../../../../shared/calendar'
import { minuteToY, type AggregationWindowMinutes } from './TimeGrid'
import ActivitySlice from './ActivitySlice'

type ActivityLaneProps = {
  slices: ActivitySliceType[]
  aggregationMinutes: AggregationWindowMinutes
  selectedSliceId: string | null
  onSliceClick: (slice: ActivitySliceType) => void
}

export default function ActivityLane({
  slices,
  aggregationMinutes,
  selectedSliceId,
  onSliceClick
}: ActivityLaneProps): JSX.Element {
  return (
    <div
      aria-label="Activity timeline"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        right: 0,
        borderLeft: '1px solid var(--border)'
      }}
    >
      {/* Hour grid lines — mirror the planned lane so both sides share the same rhythm */}
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: minuteToY(hour * 60, aggregationMinutes),
            left: 0,
            right: 0,
            height: 1,
            background: 'var(--border)'
          }}
        />
      ))}

      {slices
        .filter((slice) => slice.kind !== 'gap')
        .map((slice) => (
          <ActivitySlice
            key={slice.id}
            slice={slice}
            aggregationMinutes={aggregationMinutes}
            selected={slice.id === selectedSliceId}
            onClick={onSliceClick}
          />
        ))}
    </div>
  )
}
