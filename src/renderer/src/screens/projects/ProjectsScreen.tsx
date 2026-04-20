import { JSX, useCallback, useMemo, useState } from 'react'
import type { ProjectRecord } from '../../../../shared/projects'
import { useProjects } from '../calendar/useProjects'
import ProjectCard from './ProjectCard'
import ProjectEditor from './ProjectEditor'

type EditorState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; project: ProjectRecord }

export default function ProjectsScreen(): JSX.Element {
  const { projects, loading, error, refetch } = useProjects()
  const [editor, setEditor] = useState<EditorState>({ kind: 'none' })
  const [showArchived, setShowArchived] = useState(false)

  const { active, archived } = useMemo(() => {
    const activeList: ProjectRecord[] = []
    const archivedList: ProjectRecord[] = []
    for (const p of projects) {
      if (p.archived) archivedList.push(p)
      else activeList.push(p)
    }
    return { active: activeList, archived: archivedList }
  }, [projects])

  const closeEditor = useCallback(() => setEditor({ kind: 'none' }), [])

  const handleCreate = useCallback(
    async (input: { name: string; description: string | null; color: string | null }) => {
      await window.api.projects.create(input)
      refetch()
    },
    [refetch]
  )

  const handleUpdate = useCallback(
    async (input: {
      id: string
      name: string
      description: string | null
      color: string | null
    }) => {
      await window.api.projects.update(input)
      refetch()
    },
    [refetch]
  )

  const handleArchive = useCallback(
    async (input: { id: string; archived: boolean }) => {
      await window.api.projects.archive(input)
      refetch()
    },
    [refetch]
  )

  const handleCardArchiveToggle = useCallback(
    (project: ProjectRecord) => {
      void handleArchive({ id: project.id, archived: !project.archived })
    },
    [handleArchive]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg)',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1
            }}
          >
            Projects
          </h1>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              margin: '4px 0 0',
              lineHeight: 1.3
            }}
          >
            Context for calendar blocks and AI activity analysis.
          </p>
        </div>

        <div style={{ flex: 1 }} />

        {archived.length > 0 && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show archived ({archived.length})
          </label>
        )}

        <button
          type="button"
          onClick={() => setEditor({ kind: 'create' })}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--r-md)',
            border: 'none',
            background: 'var(--olive-500)',
            color: '#fff',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          + New project
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 48px' }}>
          {loading && projects.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</p>
          )}

          {error && (
            <p style={{ color: 'var(--terra-500)', fontSize: 13 }}>
              Failed to load projects: {error}
            </p>
          )}

          {!loading && active.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 24px',
                textAlign: 'center',
                border: '1px dashed var(--border2)',
                borderRadius: 'var(--r-md)',
                background: 'var(--surface2)'
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  fontWeight: 400,
                  color: 'var(--text-primary)',
                  margin: 0
                }}
              >
                No active projects yet
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  margin: '8px 0 20px',
                  maxWidth: 420,
                  lineHeight: 1.5
                }}
              >
                Define the work you're currently focused on. A clear description helps the AI
                recognize when your activity is on-track.
              </p>
              <button
                type="button"
                onClick={() => setEditor({ kind: 'create' })}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--r-md)',
                  border: 'none',
                  background: 'var(--olive-500)',
                  color: '#fff',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Create your first project
              </button>
            </div>
          )}

          {active.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16
              }}
            >
              {active.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={(p) => setEditor({ kind: 'edit', project: p })}
                  onArchiveToggle={handleCardArchiveToggle}
                />
              ))}
            </div>
          )}

          {showArchived && archived.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 12px'
                }}
              >
                Archived
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 16
                }}
              >
                {archived.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={(p) => setEditor({ kind: 'edit', project: p })}
                    onArchiveToggle={handleCardArchiveToggle}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {editor.kind !== 'none' && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              borderLeft: '1px solid var(--border)',
              animation: 'slideIn 200ms ease-out'
            }}
          >
            <ProjectEditor
              mode={editor.kind === 'edit' ? 'edit' : 'create'}
              initialValues={editor.kind === 'edit' ? editor.project : undefined}
              onClose={closeEditor}
              onCreate={editor.kind === 'create' ? handleCreate : undefined}
              onUpdate={editor.kind === 'edit' ? handleUpdate : undefined}
              onArchive={editor.kind === 'edit' ? handleArchive : undefined}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(8px); opacity: 0; }
          to   { transform: translateX(0);  opacity: 1; }
        }
      `}</style>
    </div>
  )
}
