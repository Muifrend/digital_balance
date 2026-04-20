import { JSX } from 'react'
import canopyLogo from '../assets/canopy.svg'

export type NavSection = 'calendar' | 'projects' | 'analytics' | 'friends' | 'settings'

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

const iconBtnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text-tertiary)',
  transition: 'background 120ms ease-out, color 120ms ease-out'
}

const iconBtnActive: React.CSSProperties = {
  ...iconBtnBase,
  background: 'var(--olive-100)',
  color: 'var(--olive-600)'
}

function GearIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
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
      <img
        src={canopyLogo}
        alt="Canopy"
        style={{
          height: 36,
          width: 36,
          marginRight: 4,
          borderRadius: 'var(--r-sm)',
          display: 'block'
        }}
      />
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

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={() => onChange('settings')}
        aria-label="Settings"
        title="Settings"
        style={active === 'settings' ? iconBtnActive : iconBtnBase}
      >
        <GearIcon />
      </button>
    </nav>
  )
}
