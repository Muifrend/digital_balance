import { JSX } from 'react'

export type NavSection = 'calendar' | 'projects' | 'analytics' | 'friends'

type TopNavProps = {
  active: NavSection
  onChange: (section: NavSection) => void
}

const tabBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  transition: 'background 120ms ease-out, color 120ms ease-out'
}

const tabActive: React.CSSProperties = {
  ...tabBase,
  background: 'var(--olive-100)',
  color: 'var(--olive-600)'
}

export default function TopNav({ active, onChange }: TopNavProps): JSX.Element {
  const sections: Array<{ key: NavSection; label: string }> = [
    { key: 'calendar', label: 'Calendar' },
    { key: 'projects', label: 'Projects' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'friends', label: 'Friends' }
  ]

  return (
    <nav
      aria-label="Primary"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 400,
          color: 'var(--text-primary)',
          marginRight: 8,
          letterSpacing: '0.01em'
        }}
      >
        Canopy
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        {sections.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={active === key ? tabActive : tabBase}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
