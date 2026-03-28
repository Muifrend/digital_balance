import { JSX, useEffect, useRef } from 'react'
import TimeRail from './TimeRail'

// ─── Time math ────────────────────────────────────────────────────────────────
// All pixel positioning in both lanes derives from these two exports so that
// the time axis is always consistent between PlannedLane and ActivityLane.

export type ZoomLevel = 1 | 2 | 3 | 4

const ZOOM_MULTIPLIERS: Record<ZoomLevel, number> = {
  1: 0.75, // 48 px / hour
  2: 1.25, // 80 px / hour  ← default
  3: 1.875, // 120 px / hour
  4: 3.125 // 200 px / hour
}

export const BASE_PX_PER_HOUR = 64

export function pxPerHour(zoom: ZoomLevel): number {
  return BASE_PX_PER_HOUR * ZOOM_MULTIPLIERS[zoom]
}

/** Convert a minute-of-day (0–1440) to a pixel offset from the top of the grid. */
export function minuteToY(minute: number, zoom: ZoomLevel): number {
  return (minute / 60) * pxPerHour(zoom)
}

/** Convert a pixel offset from the top of the grid to a minute-of-day. */
export function yToMinute(y: number, zoom: ZoomLevel): number {
  return (y / pxPerHour(zoom)) * 60
}

/** Snap a minute value to the nearest 15-minute boundary. */
export function snapToQuarter(minute: number): number {
  return Math.round(minute / 15) * 15
}

/** Clamp a value between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Parse an ISO datetime string into a minute-of-day (local time). */
export function isoToMinuteOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Build an ISO datetime string for a given local date + minute-of-day. */
export function minuteOfDayToIso(localDate: string, minute: number): string {
  const [year, month, day] = localDate.split('-').map(Number)
  const h = Math.floor(minute / 60)
  const m = minute % 60
  // Construct a local datetime and convert to ISO
  const d = new Date(year, month - 1, day, h, m, 0, 0)
  return d.toISOString()
}

/** Format a minute-of-day as "HH:MM" (24-hour). */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── Current time line ────────────────────────────────────────────────────────

function CurrentTimeLine({ zoom }: { zoom: ZoomLevel }): JSX.Element | null {
  const now = new Date()
  const minute = now.getHours() * 60 + now.getMinutes()
  const top = minuteToY(minute, zoom)

  return (
    <div
      role="presentation"
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: '1.5px',
        background: 'var(--terra-300)',
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {/* Dot on the left edge */}
      <div
        style={{
          position: 'absolute',
          left: 44,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--terra-300)'
        }}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

type TimeGridProps = {
  zoom: ZoomLevel
  scrollRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

export default function TimeGrid({ zoom, scrollRef, children }: TimeGridProps): JSX.Element {
  const totalHeight = 24 * pxPerHour(zoom)
  const innerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll: put the hour 1 hour before now near the top of the viewport.
  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const targetMinute = Math.max(0, now.getHours() * 60 + now.getMinutes() - 60)
    scrollRef.current.scrollTop = minuteToY(targetMinute, zoom)
    // Intentionally only runs once on mount; zoom changes are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On zoom change, keep the currently-centered time in view.
  const prevZoomRef = useRef(zoom)
  useEffect(() => {
    if (prevZoomRef.current === zoom) return
    if (!scrollRef.current || !innerRef.current) return

    const container = scrollRef.current
    const viewportH = container.clientHeight
    const prevPxH = pxPerHour(prevZoomRef.current)
    const midMinute = ((container.scrollTop + viewportH / 2) / prevPxH) * 60

    prevZoomRef.current = zoom
    container.scrollTop = minuteToY(midMinute, zoom) - viewportH / 2
  }, [zoom, scrollRef])

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        position: 'relative',
        background: 'var(--bg)'
      }}
    >
      <div ref={innerRef} style={{ position: 'relative', height: totalHeight, minWidth: 0 }}>
        <TimeRail zoom={zoom} />
        <CurrentTimeLine zoom={zoom} />
        {children}
      </div>
    </div>
  )
}
