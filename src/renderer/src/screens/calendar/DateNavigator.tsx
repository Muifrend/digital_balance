import { JSX } from 'react'

type DateNavigatorProps = {
  date: string // ISO local date string, e.g. "2026-03-27"
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  // Construct in local time to avoid UTC offset surprises
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function isToday(isoDate: string): boolean {
  const today = new Date()
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-')
  return isoDate === todayStr
}

const iconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: 14,
  fontWeight: 500,
  transition: 'background 120ms ease-out, border-color 120ms ease-out'
}

export default function DateNavigator({ date, onPrev, onNext, onToday }: DateNavigatorProps): JSX.Element {
  const today = isToday(date)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={onPrev}
        aria-label="Previous day"
        style={iconStyle}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'
        }}
      >
        ‹
      </button>

      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--text-primary)',
          minWidth: 220,
          textAlign: 'center'
        }}
      >
        {formatDate(date)}
      </span>

      <button
        onClick={onNext}
        aria-label="Next day"
        style={iconStyle}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'
        }}
      >
        ›
      </button>

      {!today && (
        <button
          onClick={onToday}
          style={{
            marginLeft: 4,
            padding: '4px 12px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border2)',
            background: 'var(--olive-50)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--olive-600)',
            transition: 'background 120ms ease-out'
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--olive-100)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--olive-50)'
          }}
        >
          Today
        </button>
      )}
    </div>
  )
}
