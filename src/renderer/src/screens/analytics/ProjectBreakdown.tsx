import { JSX } from 'react'
import type { ProjectBreakdownEntry } from '../../../../shared/analytics'
import StackedBarRow from './StackedBarRow'

type ProjectBreakdownProps = {
  projects: ProjectBreakdownEntry[]
}

export default function ProjectBreakdown({ projects }: ProjectBreakdownProps): JSX.Element {
  const rowMax = projects.reduce((m, p) => Math.max(m, p.totalMinutes), 0)

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '18px 24px'
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          margin: '0 0 14px'
        }}
      >
        Time per project
      </h2>
      {projects.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
          No planned blocks with classifications for this day. Create schedule blocks linked to
          projects on the Calendar tab to see project-level breakdowns here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {projects.map((project) => {
            const label = project.projectName ?? '(Unassigned)'
            const accent = project.projectColor?.trim() || 'var(--text-tertiary)'
            return (
              <StackedBarRow
                key={project.projectId ?? '__unassigned__'}
                label={label}
                accent={accent}
                totalMinutes={project.totalMinutes}
                rowMaxMinutes={rowMax}
                segments={[
                  { value: project.onTaskMinutes, color: 'var(--olive-400)', label: 'On-task' },
                  { value: project.offTaskMinutes, color: 'var(--amber-300)', label: 'Off-task' }
                ]}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
