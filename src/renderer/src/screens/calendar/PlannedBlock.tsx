import { JSX, useRef, useState } from 'react'
import type { PlannedBlock as PlannedBlockType } from '../../../../shared/calendar'
import {
  clamp,
  isoToMinuteOfDay,
  minuteOfDayToIso,
  minuteToY,
  snapToQuarter,
  yToMinute,
  type ZoomLevel
} from './TimeGrid'

type DragKind = 'move' | 'resize-top' | 'resize-bottom'

type PlannedBlockProps = {
  block: PlannedBlockType
  zoom: ZoomLevel
  date: string
  selected: boolean
  onClick: (block: PlannedBlockType) => void
  onUpdate: (id: string, startAt: string, endAt: string) => void
}

// Derive a background and border color from a project hex color or use the
// default olive palette.
function blockColors(projectColor: string | null): {
  bg: string
  border: string
  text: string
} {
  if (projectColor) {
    return {
      bg: `${projectColor}22`, // 8 % alpha
      border: projectColor,
      text: 'var(--text-primary)'
    }
  }
  return {
    bg: 'var(--olive-100)',
    border: 'var(--olive-500)',
    text: 'var(--olive-700)'
  }
}

const HANDLE_HEIGHT = 8 // px of resize zone at top and bottom edges

export default function PlannedBlock({
  block,
  zoom,
  date,
  selected,
  onClick,
  onUpdate
}: PlannedBlockProps): JSX.Element {
  const startMin = isoToMinuteOfDay(block.startAt)
  const endMin = isoToMinuteOfDay(block.endAt)
  const top = minuteToY(startMin, zoom)
  const height = Math.max(minuteToY(endMin - startMin, zoom), 20)

  const { bg, border, text } = blockColors(block.projectColor)

  // Optimistic local override during drag so the block moves immediately.
  const [localTop, setLocalTop] = useState<number | null>(null)
  const [localHeight, setLocalHeight] = useState<number | null>(null)

  const dragRef = useRef<{
    kind: DragKind
    startPointerY: number
    originalStartMin: number
    originalEndMin: number
  } | null>(null)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, kind: DragKind): void {
    e.stopPropagation() // Don't bubble to the lane's drag-to-create handler
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      kind,
      startPointerY: e.clientY,
      originalStartMin: startMin,
      originalEndMin: endMin
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) return
    const { kind, startPointerY, originalStartMin, originalEndMin } = dragRef.current
    const deltaY = e.clientY - startPointerY
    const deltaMins = yToMinute(deltaY, zoom)

    if (kind === 'move') {
      const duration = originalEndMin - originalStartMin
      const newStart = snapToQuarter(clamp(originalStartMin + deltaMins, 0, 24 * 60 - duration))
      setLocalTop(minuteToY(newStart, zoom))
      setLocalHeight(minuteToY(duration, zoom))
    } else if (kind === 'resize-top') {
      const newStart = snapToQuarter(clamp(originalStartMin + deltaMins, 0, originalEndMin - 15))
      setLocalTop(minuteToY(newStart, zoom))
      setLocalHeight(minuteToY(originalEndMin - newStart, zoom))
    } else {
      const newEnd = snapToQuarter(clamp(originalEndMin + deltaMins, originalStartMin + 15, 24 * 60))
      setLocalHeight(minuteToY(newEnd - originalStartMin, zoom))
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) return
    const { kind, startPointerY, originalStartMin, originalEndMin } = dragRef.current
    dragRef.current = null

    const deltaY = e.clientY - startPointerY
    // If there was essentially no movement, treat as a click.
    if (Math.abs(deltaY) < 4) {
      setLocalTop(null)
      setLocalHeight(null)
      onClick(block)
      return
    }

    const deltaMins = yToMinute(deltaY, zoom)
    let newStartMin = originalStartMin
    let newEndMin = originalEndMin

    if (kind === 'move') {
      const duration = originalEndMin - originalStartMin
      newStartMin = snapToQuarter(clamp(originalStartMin + deltaMins, 0, 24 * 60 - duration))
      newEndMin = newStartMin + duration
    } else if (kind === 'resize-top') {
      newStartMin = snapToQuarter(clamp(originalStartMin + deltaMins, 0, originalEndMin - 15))
    } else {
      newEndMin = snapToQuarter(clamp(originalEndMin + deltaMins, originalStartMin + 15, 24 * 60))
    }

    setLocalTop(null)
    setLocalHeight(null)

    const newStartAt = minuteOfDayToIso(date, newStartMin)
    const newEndAt = minuteOfDayToIso(date, newEndMin)
    onUpdate(block.id, newStartAt, newEndAt)
  }

  const resolvedTop = localTop ?? top
  const resolvedHeight = localHeight ?? height
  const isDragging = dragRef.current !== null

  // Suppress scroll-capture by stopping wheel events from bubbling during drag.
  const preventScroll = (e: React.WheelEvent): void => {
    if (isDragging) e.stopPropagation()
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: resolvedTop,
        left: 4,
        right: 4,
        height: resolvedHeight,
        background: bg,
        borderLeft: `3px solid ${border}`,
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        cursor: 'grab',
        overflow: 'hidden',
        outline: selected ? `2px solid ${border}` : 'none',
        outlineOffset: 1,
        userSelect: 'none',
        zIndex: isDragging ? 20 : 1,
        transition: isDragging ? 'none' : 'outline 80ms ease-out'
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={preventScroll}
    >
      {/* Resize handle — top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: HANDLE_HEIGHT,
          cursor: 'ns-resize',
          zIndex: 2
        }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-top')}
      />

      {/* Move area */}
      <div
        style={{
          position: 'absolute',
          top: HANDLE_HEIGHT,
          left: 0,
          right: 0,
          bottom: HANDLE_HEIGHT,
          padding: '2px 6px',
          cursor: 'grab'
        }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      >
        {resolvedHeight > 20 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: text,
              display: 'block',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              lineHeight: 1.4
            }}
          >
            {block.taskTitle}
          </span>
        )}
        {resolvedHeight > 36 && block.projectName && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              display: 'block',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis'
            }}
          >
            {block.projectName}
          </span>
        )}
      </div>

      {/* Resize handle — bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: HANDLE_HEIGHT,
          cursor: 'ns-resize',
          zIndex: 2
        }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-bottom')}
      />
    </div>
  )
}
