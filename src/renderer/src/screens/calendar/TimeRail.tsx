import { JSX } from 'react'
import { minuteToY, type ZoomLevel } from './TimeGrid'

// 12-hour formatted label for a 0-based hour (0 = midnight, 12 = noon).
function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

type TimeRailProps = {
  zoom: ZoomLevel
}

export default function TimeRail({ zoom }: TimeRailProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 52,
        bottom: 0,
        pointerEvents: 'none',
        userSelect: 'none'
      }}
    >
      {Array.from({ length: 24 }, (_, hour) => {
        const top = minuteToY(hour * 60, zoom)
        return (
          <div
            key={hour}
            style={{
              position: 'absolute',
              top,
              left: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              paddingTop: 2
            }}
          >
            <span
              style={{
                fontSize: 11,
                lineHeight: 1,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 400,
                whiteSpace: 'nowrap',
                paddingRight: 8,
                textAlign: 'right',
                width: '100%'
              }}
            >
              {hourLabel(hour)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
