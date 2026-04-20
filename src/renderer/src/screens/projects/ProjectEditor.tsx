import { JSX, useEffect, useRef, useState } from 'react'
import type { ProjectRecord } from '../../../../shared/projects'
import CloseButton from '../calendar/CloseButton'
import SidePanel from '../calendar/SidePanel'
import { useEscapeKey } from '../calendar/useEscapeKey'

export type ProjectEditorMode = 'create' | 'edit'

type ProjectEditorProps = {
  mode: ProjectEditorMode
  initialValues?: ProjectRecord
  onClose: () => void
  onCreate?: (input: {
    name: string
    description: string | null
    color: string | null
  }) => Promise<void>
  onUpdate?: (input: {
    id: string
    name: string
    description: string | null
    color: string | null
  }) => Promise<void>
  onArchive?: (input: { id: string; archived: boolean }) => Promise<void>
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

const helperStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  marginTop: 4,
  lineHeight: 1.4
}

export default function ProjectEditor({
  mode,
  initialValues,
  onClose,
  onCreate,
  onUpdate,
  onArchive
}: ProjectEditorProps): JSX.Element {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [color, setColor] = useState(initialValues?.color ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEscapeKey(onClose)

  const heading = mode === 'edit' ? 'Edit project' : 'New project'
  const canSave = name.trim().length > 0 && description.trim().length > 0

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSave) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        color: color.trim() || null
      }
      if (mode === 'create' && onCreate) {
        await onCreate(payload)
      } else if (mode === 'edit' && onUpdate && initialValues) {
        await onUpdate({ ...payload, id: initialValues.id })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  async function handleArchiveToggle(): Promise<void> {
    if (!onArchive || !initialValues) return
    setSubmitting(true)
    setError(null)
    try {
      await onArchive({ id: initialValues.id, archived: !initialValues.archived })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <SidePanel width={360}>
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
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
        <CloseButton onClick={onClose} />
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        <div>
          <label htmlFor="project-name" style={labelStyle}>
            Title
          </label>
          <input
            ref={nameRef}
            id="project-name"
            type="text"
            required
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="project-description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="project-description"
            required
            placeholder="What is this project? What are you building, and why? The more context you give, the better the AI can judge whether your activity matches."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={helperStyle}>
            This description is sent to the AI when classifying activity on blocks linked to this
            project.
          </p>
        </div>

        <div>
          <label htmlFor="project-color" style={labelStyle}>
            Color (optional)
          </label>
          <input
            id="project-color"
            type="text"
            placeholder="#5c6230 or leave blank"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--terra-500)', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="submit"
            disabled={submitting || !canSave}
            style={{
              ...btnPrimary,
              opacity: submitting || !canSave ? 0.6 : 1,
              cursor: submitting || !canSave ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? '…' : mode === 'create' ? 'Create' : 'Save'}
          </button>
          <button type="button" onClick={onClose} style={btnGhost}>
            Cancel
          </button>
        </div>

        {mode === 'edit' && initialValues && onArchive && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => void handleArchiveToggle()}
              disabled={submitting}
              style={{
                background: 'none',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              {initialValues.archived ? 'Unarchive project' : 'Archive project'}
            </button>
          </div>
        )}
      </form>
    </SidePanel>
  )
}
