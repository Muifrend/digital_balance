import { JSX } from 'react'
import { minuteToY, type AggregationWindowMinutes } from './TimeGrid'

type HourGridLinesProps = {
  aggregationMinutes: AggregationWindowMinutes
}

export default function HourGridLines({ aggregationMinutes }: HourGridLinesProps): JSX.Element {
  return (
    <>
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
    </>
  )
}
