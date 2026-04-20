import { JSX } from 'react'
import type { ProjectRecord } from '../../../../shared/projects'

type ProjectCardProps = {
  project: ProjectRecord
  onEdit: (project: ProjectRecord) => void
  onArchiveToggle: (project: ProjectRecord) => void
}

export default function ProjectCard({
  project,
  onEdit,
  onArchiveToggle
}: ProjectCardProps): JSX.Element {
  const accent = project.color?.trim() || 'var(--olive-400)'

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 18px 16px',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        minHeight: 180,
        opacity: project.archived ? 0.55 : 1,
        transition: 'box-shadow 120ms ease-out, border-color 120ms ease-out'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
          borderTopLeftRadius: 'var(--r-md)',
          borderTopRightRadius: 'var(--r-md)'
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 400,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.2,
            flex: 1,
            wordBreak: 'break-word'
          }}
        >
          {project.name}
        </h3>
        {project.archived && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border2)',
              flexShrink: 0
            }}
          >
            Archived
          </span>
        )}
      </div>

      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          margin: 0,
          flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 5,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {project.description?.trim() || (
          <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            No description yet.
          </span>
        )}
      </p>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}
      >
        <button
          type="button"
          onClick={() => onEdit(project)}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onArchiveToggle(project)}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          {project.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </div>
  )
}
