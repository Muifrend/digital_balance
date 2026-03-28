import { JSX, useEffect, useRef, useState } from 'react'
import type { PlannedBlock } from '../../../../shared/calendar'
import type { ProjectRecord } from '../../../../shared/projects'
import { formatMinute, isoToMinuteOfDay } from './TimeGrid'

export type BlockEditorMode = 'create' | 'edit' | 'redirect'

type InitialValues = {
  startAt: string
  endAt: string
  taskTitle?: string
  taskDescription?: string | null
  goalSeed?: string | null
  projectId?: string | null
  // For redirect mode
  sourceBlockId?: string
}

type BlockEditorProps = {
  mode: BlockEditorMode
  initialValues: InitialValues
  projects: ProjectRecord[]
  onClose: () => void
  onCreate?: (input: {
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => Promise<PlannedBlock>
  onUpdate?: (input: {
    id: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => Promise<PlannedBlock>
  onDelete?: (id: string) => Promise<void>
  onRedirect?: (input: {
    sourceBlockId: string
    splitAt: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }) => Promise<void>
  blockId?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--text-primary)',
  outline: 'none'
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  display: 'block',
  marginBottom: 4
}

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '9px 0',
  borderRadius: 'var(--r-md)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  fontWeight: 500,
  background: 'var(--olive-500)',
  color: '#fff',
  transition: 'background 120ms ease-out'
}

const btnGhost: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border2)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  fontWeight: 400,
  background: 'transparent',
  color: 'var(--text-secondary)',
  transition: 'background 120ms ease-out'
}

function formatTimeRange(startAt: string, endAt: string): string {
  return `${formatMinute(isoToMinuteOfDay(startAt))} – ${formatMinute(isoToMinuteOfDay(endAt))}`
}

export default function BlockEditor({
  mode,
  initialValues,
  projects,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onRedirect,
  blockId
}: BlockEditorProps): JSX.Element {
  const [taskTitle, setTaskTitle] = useState(initialValues.taskTitle ?? '')
  const [taskDescription, setTaskDescription] = useState(initialValues.taskDescription ?? '')
  const [goalSeed, setGoalSeed] = useState(initialValues.goalSeed ?? '')
  const [projectId, setProjectId] = useState<string | null>(initialValues.projectId ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const heading =
    mode === 'redirect'
      ? 'What are you actually doing?'
      : mode === 'edit'
        ? 'Edit block'
        : 'New block'

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        projectId,
        taskTitle: taskTitle.trim(),
        taskDescription: taskDescription.trim() || null,
        goalSeed: goalSeed.trim() || null
      }
      if (mode === 'create' && onCreate) {
        await onCreate({ ...payload, startAt: initialValues.startAt, endAt: initialValues.endAt })
      } else if (mode === 'edit' && onUpdate && blockId) {
        await onUpdate({
          ...payload,
          id: blockId,
          startAt: initialValues.startAt,
          endAt: initialValues.endAt
        })
      } else if (mode === 'redirect' && onRedirect && initialValues.sourceBlockId) {
        await onRedirect({
          ...payload,
          sourceBlockId: initialValues.sourceBlockId,
          splitAt: initialValues.startAt
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!onDelete || !blockId) return
    setSubmitting(true)
    try {
      await onDelete(blockId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      style={{
        width: 320,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0
            }}
          >
            {heading}
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
            {formatTimeRange(initialValues.startAt, initialValues.endAt)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 18,
            lineHeight: 1,
            padding: 4
          }}
        >
          ×
        </button>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* Task title */}
        <div>
          <label htmlFor="task-title" style={labelStyle}>
            Task
          </label>
          <input
            ref={titleRef}
            id="task-title"
            type="text"
            required
            placeholder="What are you working on?"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Project */}
        <div>
          <label htmlFor="project" style={labelStyle}>
            Project
          </label>
          <select
            id="project"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">No project</option>
            {projects
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" style={labelStyle}>
            Notes
          </label>
          <textarea
            id="description"
            placeholder="Any additional context…"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Goal seed */}
        <div>
          <label htmlFor="goal-seed" style={labelStyle}>
            Coaching hint
          </label>
          <textarea
            id="goal-seed"
            placeholder="What does success look like for this block?"
            value={goalSeed}
            onChange={(e) => setGoalSeed(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontSize: 12 }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: 'var(--terra-500)', margin: 0 }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="submit"
            disabled={submitting || !taskTitle.trim()}
            style={{
              ...btnPrimary,
              opacity: submitting || !taskTitle.trim() ? 0.6 : 1,
              cursor: submitting || !taskTitle.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? '…' : mode === 'create' ? 'Create' : mode === 'redirect' ? 'Switch' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>
            Cancel
          </button>
        </div>

        {/* Delete (edit mode only) */}
        {mode === 'edit' && onDelete && blockId && (
          <div style={{ marginTop: 4 }}>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Delete this block?
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={submitting}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: 'none',
                    background: 'var(--terra-500)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{ ...btnGhost, padding: '5px 12px', fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Delete block
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
