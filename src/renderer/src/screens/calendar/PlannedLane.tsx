import { JSX, useRef, useState } from 'react'
import type { PlannedBlock as PlannedBlockType } from '../../../../shared/calendar'
import {
  clamp,
  formatMinute,
  minuteOfDayToIso,
  minuteToY,
  snapToQuarter,
  yToMinute,
  type ZoomLevel
} from './TimeGrid'
import PlannedBlock from './PlannedBlock'

type DragState = {
  startMin: number
  endMin: number
}

type PlannedLaneProps = {
  blocks: PlannedBlockType[]
  zoom: ZoomLevel
  date: string
  scrollRef: React.RefObject<HTMLDivElement | null>
  selectedBlockId: string | null
  onBlockClick: (block: PlannedBlockType) => void
  onBlockUpdate: (id: string, startAt: string, endAt: string) => void
  onCreateDraft: (startAt: string, endAt: string) => void
}

export default function PlannedLane({
  blocks,
  zoom,
  date,
  scrollRef,
  selectedBlockId,
  onBlockClick,
  onBlockUpdate,
  onCreateDraft
}: PlannedLaneProps): JSX.Element {
  const laneRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  function getRelativeY(clientY: number): number {
    const rect = laneRef.current!.getBoundingClientRect()
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    return clientY - rect.top + scrollTop
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    // Only respond to clicks directly on the lane background.
    if ((e.target as HTMLElement).closest('[data-block]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const y = getRelativeY(e.clientY)
    const startMin = snapToQuarter(clamp(yToMinute(y, zoom), 0, 23 * 60 + 45))
    setDragState({ startMin, endMin: startMin + 15 })
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragState) return
    const y = getRelativeY(e.clientY)
    const currentMin = snapToQuarter(clamp(yToMinute(y, zoom), 0, 24 * 60))
    setDragState((s) => s && { ...s, endMin: Math.max(currentMin, s.startMin + 15) })
  }

  function handlePointerUp(): void {
    if (!dragState) return
    const { startMin, endMin } = dragState
    setDragState(null)
    if (endMin - startMin >= 15) {
      onCreateDraft(minuteOfDayToIso(date, startMin), minuteOfDayToIso(date, endMin))
    }
  }

  return (
    <div
      ref={laneRef}
      aria-label="Planned blocks"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 52, // after time rail
        width: 'calc(50% - 52px)',
        borderRight: '1px solid var(--border)',
        cursor: 'crosshair'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Hour grid lines */}
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: minuteToY(hour * 60, zoom),
            left: 0,
            right: 0,
            height: 1,
            background: 'var(--border)'
          }}
        />
      ))}

      {/* Planned blocks */}
      {blocks.map((block) => (
        <div key={block.id} data-block={block.id}>
          <PlannedBlock
            block={block}
            zoom={zoom}
            date={date}
            selected={block.id === selectedBlockId}
            onClick={onBlockClick}
            onUpdate={onBlockUpdate}
          />
        </div>
      ))}

      {/* Drag-to-create ghost */}
      {dragState && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: minuteToY(dragState.startMin, zoom),
            left: 4,
            right: 4,
            height: Math.max(minuteToY(dragState.endMin - dragState.startMin, zoom), 4),
            background: 'rgba(228, 232, 203, 0.7)', // --olive-100 at 70%
            borderLeft: '3px dashed var(--olive-400)',
            border: '1.5px dashed var(--olive-400)',
            borderRadius: 'var(--r-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: 'var(--olive-600)',
              fontFamily: 'var(--font-ui)'
            }}
          >
            {formatMinute(dragState.startMin)} – {formatMinute(dragState.endMin)}
          </span>
        </div>
      )}
    </div>
  )
}
