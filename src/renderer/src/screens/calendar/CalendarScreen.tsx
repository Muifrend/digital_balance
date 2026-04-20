import { JSX, useCallback, useEffect, useRef, useState } from 'react'
import type { ActivitySlice, AggregationWindowMinutes, PlannedBlock } from '../../../../shared/calendar'
import type { CoachingPrompt } from '../../../../shared/coaching'
import type { PipelineStatus } from '../../../../shared/pipeline'
import AggregationPicker from './AggregationPicker'
import BlockEditor from './BlockEditor'
import CoachingBanner from './CoachingBanner'
import DateNavigator from './DateNavigator'
import EvidenceDrawer from './EvidenceDrawer'
import ActivityLane from './ActivityLane'
import PlannedLane from './PlannedLane'
import TimeGrid from './TimeGrid'
import { useCalendarData } from './useCalendarData'
import { useProjects } from './useProjects'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-')
}

function addDays(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year, month - 1, day + delta)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-')
}

// ─── Panel state ──────────────────────────────────────────────────────────────

type ActivePanel =
  | { kind: 'none' }
  | { kind: 'create'; startAt: string; endAt: string }
  | { kind: 'edit'; block: PlannedBlock }
  | { kind: 'redirect'; sourceBlockId: string; splitAt: string }
  | { kind: 'evidence'; slice: ActivitySlice }

// ─── Component ────────────────────────────────────────────────────────────────

type CalendarScreenProps = {
  pipelineStatus: PipelineStatus
}

export default function CalendarScreen({ pipelineStatus }: CalendarScreenProps): JSX.Element {
  const [date, setDate] = useState(todayIso)
  const [aggregationMinutes, setAggregationMinutes] = useState<AggregationWindowMinutes>(15)
  const [panel, setPanel] = useState<ActivePanel>({ kind: 'none' })
  const [activePrompt, setActivePrompt] = useState<CoachingPrompt | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const { data: dayData, refetch } = useCalendarData(date, aggregationMinutes)
  const { projects } = useProjects()

  // ─── Coaching subscription ───────────────────────────────────────────────

  useEffect(() => {
    void window.api.coaching
      .getActive()
      .then(setActivePrompt)
      .catch(() => null)
    const unsub = window.api.coaching.onPrompt(setActivePrompt)
    return unsub
  }, [])

  // ─── Date navigation ─────────────────────────────────────────────────────

  const goToDate = useCallback((d: string) => {
    setDate(d)
    setPanel({ kind: 'none' })
  }, [])

  // ─── Block CRUD ──────────────────────────────────────────────────────────

  const handleCreateBlock = useCallback(
    async (input: {
      projectId: string | null
      taskTitle: string
      taskDescription: string | null
      goalSeed: string | null
      startAt: string
      endAt: string
    }) => {
      const block = await window.api.calendar.createBlock(input)
      refetch()
      return block
    },
    [refetch]
  )

  const handleUpdateBlock = useCallback(
    async (input: {
      id: string
      projectId: string | null
      taskTitle: string
      taskDescription: string | null
      goalSeed: string | null
      startAt: string
      endAt: string
    }) => {
      const block = await window.api.calendar.updateBlock(input)
      refetch()
      return block
    },
    [refetch]
  )

  const handleDeleteBlock = useCallback(
    async (id: string) => {
      await window.api.calendar.deleteBlock({ id })
      refetch()
    },
    [refetch]
  )

  const handleRedirectBlock = useCallback(
    async (input: {
      sourceBlockId: string
      splitAt: string
      projectId: string | null
      taskTitle: string
      taskDescription: string | null
      goalSeed: string | null
    }) => {
      await window.api.calendar.redirectBlock(input)
      refetch()
    },
    [refetch]
  )

  // Inline drag-to-move/resize update from PlannedBlock (no panel)
  const handleBlockPositionUpdate = useCallback(
    (id: string, startAt: string, endAt: string) => {
      const block = dayData?.plannedBlocks.find((b) => b.id === id)
      if (!block) return
      void window.api.calendar
        .updateBlock({
          id,
          projectId: block.projectId,
          taskTitle: block.taskTitle,
          taskDescription: block.taskDescription,
          goalSeed: block.goalSeed,
          startAt,
          endAt
        })
        .then(() => refetch())
    },
    [dayData, refetch]
  )

  // ─── Panel helpers ───────────────────────────────────────────────────────

  const closePanel = useCallback(() => setPanel({ kind: 'none' }), [])

  const openEvidence = useCallback((slice: ActivitySlice) => {
    setPanel({ kind: 'evidence', slice })
  }, [])

  const openEdit = useCallback((block: PlannedBlock) => {
    setPanel({ kind: 'edit', block })
  }, [])

  const openCreate = useCallback((startAt: string, endAt: string) => {
    setPanel({ kind: 'create', startAt, endAt })
  }, [])

  const openRedirectFromEvidence = useCallback((sourceBlockId: string, splitAt: string) => {
    setPanel({ kind: 'redirect', sourceBlockId, splitAt })
  }, [])

  // ─── Coaching actions ────────────────────────────────────────────────────

  const handleCoachingConfirm = useCallback(async (promptId: string) => {
    await window.api.coaching.confirm({ promptId })
  }, [])

  const handleCoachingDismiss = useCallback(async (promptId: string) => {
    await window.api.coaching.dismiss({ promptId })
  }, [])

  const handleCoachingRedirect = useCallback(
    (promptId: string) => {
      // Find the planned block associated with the prompt so we can pre-fill the split time.
      const prompt = activePrompt
      if (!prompt) return
      setPanel({
        kind: 'redirect',
        sourceBlockId: prompt.plannedBlockId ?? '',
        splitAt: prompt.startAt
      })
      void window.api.coaching.dismiss({ promptId })
    },
    [activePrompt]
  )

  // ─── Derived values for the active panel ─────────────────────────────────

  const selectedBlockId =
    panel.kind === 'edit' ? panel.block.id : null

  const selectedSliceId =
    panel.kind === 'evidence' ? panel.slice.id : null

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Coaching banner */}
      {activePrompt && (
        <CoachingBanner
          prompt={activePrompt}
          onConfirm={handleCoachingConfirm}
          onDismiss={handleCoachingDismiss}
          onRedirect={handleCoachingRedirect}
        />
      )}

      {/* Top toolbar */}
      <header
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
        <DateNavigator
          date={date}
          onPrev={() => goToDate(addDays(date, -1))}
          onNext={() => goToDate(addDays(date, 1))}
          onToday={() => goToDate(todayIso())}
        />

        <div style={{ flex: 1 }} />

        {/* Pipeline status indicator */}
        {pipelineStatus.phase === 'reconciling' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--amber-100)',
              border: '1px solid var(--amber-300)',
              fontSize: 11,
              color: 'var(--amber-400)',
              fontWeight: 500
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: '2px solid var(--amber-300)',
                borderTopColor: 'var(--amber-400)',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block'
              }}
            />
            Syncing
          </div>
        )}

        <AggregationPicker value={aggregationMinutes} onChange={setAggregationMinutes} />
      </header>

      {/* Lane column labels */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
        <div style={{ width: 60, flexShrink: 0 }} />
        <div
          style={{
            flex: '0 0 calc(50% - 60px)',
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            borderRight: '1px solid var(--border)'
          }}
        >
          Planned
        </div>
        <div
          style={{
            flex: 1,
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)'
          }}
        >
          Activity
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Time grid */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '100%' }}>
          <TimeGrid aggregationMinutes={aggregationMinutes} scrollRef={scrollRef}>
            <PlannedLane
              blocks={dayData?.plannedBlocks ?? []}
              aggregationMinutes={aggregationMinutes}
              date={date}
              scrollRef={scrollRef}
              selectedBlockId={selectedBlockId}
              onBlockClick={openEdit}
              onBlockUpdate={handleBlockPositionUpdate}
              onCreateDraft={openCreate}
            />
            <ActivityLane
              slices={dayData?.activitySlices ?? []}
              aggregationMinutes={aggregationMinutes}
              selectedSliceId={selectedSliceId}
              onSliceClick={openEvidence}
            />
          </TimeGrid>
        </div>

        {/* Side panel */}
        {panel.kind !== 'none' && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              borderLeft: '1px solid var(--border)',
              animation: 'slideIn 200ms ease-out'
            }}
          >
            {panel.kind === 'evidence' && (
              <EvidenceDrawer
                slice={panel.slice}
                aggregationMinutes={aggregationMinutes}
                onClose={closePanel}
                onConfirmOnTask={(startAt, endAt) =>
                  window.api.calendar.confirmOnTask({ startAt, endAt })
                }
                onRedirect={openRedirectFromEvidence}
              />
            )}

            {(panel.kind === 'create' || panel.kind === 'edit' || panel.kind === 'redirect') && (
              <BlockEditor
                mode={
                  panel.kind === 'create'
                    ? 'create'
                    : panel.kind === 'redirect'
                      ? 'redirect'
                      : 'edit'
                }
                initialValues={
                  panel.kind === 'edit'
                    ? {
                        startAt: panel.block.startAt,
                        endAt: panel.block.endAt,
                        taskTitle: panel.block.taskTitle,
                        taskDescription: panel.block.taskDescription,
                        goalSeed: panel.block.goalSeed,
                        projectId: panel.block.projectId
                      }
                    : panel.kind === 'redirect'
                      ? {
                          startAt: panel.splitAt,
                          endAt: panel.splitAt,
                          sourceBlockId: panel.sourceBlockId
                        }
                      : {
                          startAt: panel.startAt,
                          endAt: panel.endAt
                        }
                }
                projects={projects}
                blockId={panel.kind === 'edit' ? panel.block.id : undefined}
                onClose={closePanel}
                onCreate={panel.kind === 'create' ? handleCreateBlock : undefined}
                onUpdate={panel.kind === 'edit' ? handleUpdateBlock : undefined}
                onDelete={panel.kind === 'edit' ? handleDeleteBlock : undefined}
                onRedirect={
                  panel.kind === 'redirect'
                    ? async (input) => {
                        await handleRedirectBlock(input)
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Inline keyframe for the sync spinner and panel slide-in */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn {
          from { transform: translateX(8px); opacity: 0; }
          to   { transform: translateX(0);  opacity: 1; }
        }
      `}</style>
    </div>
  )
}
