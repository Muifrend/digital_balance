import { JSX, useState } from 'react'
import type { CoachingPrompt } from '../../../../shared/coaching'

type CoachingBannerProps = {
  prompt: CoachingPrompt
  onConfirm: (promptId: string) => Promise<void>
  onDismiss: (promptId: string) => Promise<void>
  onRedirect: (promptId: string) => void
}

export default function CoachingBanner({
  prompt,
  onConfirm,
  onDismiss,
  onRedirect
}: CoachingBannerProps): JSX.Element {
  const [busy, setBusy] = useState(false)

  const bg = prompt.kind === 'afk' ? 'var(--sage-100)' : 'var(--olive-50)'
  const borderColor = prompt.kind === 'afk' ? 'var(--sage-300)' : 'var(--olive-200)'

  async function handle(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      style={{
        background: bg,
        borderBottom: `1px solid ${borderColor}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginRight: 8
          }}
        >
          {prompt.title}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{prompt.body}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => void handle(() => onConfirm(prompt.id))}
          disabled={busy}
          style={{
            padding: '5px 14px',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 500,
            background: 'var(--olive-500)',
            color: '#fff',
            opacity: busy ? 0.6 : 1
          }}
        >
          Confirm on task
        </button>
        <button
          onClick={() => onRedirect(prompt.id)}
          disabled={busy}
          style={{
            padding: '5px 14px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border2)',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            fontWeight: 400,
            background: 'transparent',
            color: 'var(--text-secondary)'
          }}
        >
          Redirect →
        </button>
        <button
          onClick={() => void handle(() => onDismiss(prompt.id))}
          disabled={busy}
          aria-label="Dismiss"
          style={{
            padding: '5px 10px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            background: 'transparent',
            color: 'var(--text-tertiary)'
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
