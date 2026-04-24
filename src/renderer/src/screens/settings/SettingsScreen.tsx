import { JSX, useEffect, useState } from 'react'
import type { SettingsSummary } from '../../../../shared/settings'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
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
  marginBottom: 6
}

const helperStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-tertiary)',
  marginTop: 6,
  lineHeight: 1.5
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 16px',
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
  color: 'var(--text-secondary)'
}

export default function SettingsScreen(): JSX.Element {
  const [summary, setSummary] = useState<SettingsSummary | null>(null)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    void window.api.settings
      .get()
      .then((s) => {
        if (isMounted) setSummary(s)
      })
      .catch((err: unknown) => {
        if (isMounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      isMounted = false
    }
  }, [])

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    setError(null)
    setFlash(null)
    try {
      const next = await window.api.settings.update({ openAiApiKey: trimmed })
      setSummary(next)
      setDraft('')
      setFlash('API key saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClear(): Promise<void> {
    setSubmitting(true)
    setError(null)
    setFlash(null)
    try {
      const next = await window.api.settings.update({ openAiApiKey: null })
      setSummary(next)
      setDraft('')
      setFlash('API key removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSubmitting(false)
    }
  }

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
          background: 'var(--surface)',
          flexShrink: 0
        }}
      >
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
          Settings
        </h1>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            margin: '4px 0 0',
            lineHeight: 1.3
          }}
        >
          Configure keys and preferences for this installation.
        </p>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <section
          data-demo-anchor="settings-api-key"
          style={{
            maxWidth: 560,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '20px 24px'
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: '0 0 4px'
            }}
          >
            OpenAI API key
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Required to run AI classification on your minutes. Stored locally in
            <code style={{ margin: '0 4px', padding: '1px 4px', background: 'var(--bg2)', borderRadius: 4, fontSize: 12 }}>
              settings.json
            </code>
            alongside the database.
          </p>

          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-sm)',
              background: summary?.hasOpenAiApiKey ? 'var(--olive-50)' : 'var(--bg2)',
              border: '1px solid var(--border)',
              fontSize: 12,
              color: summary?.hasOpenAiApiKey ? 'var(--olive-600)' : 'var(--text-tertiary)',
              marginBottom: 16,
              fontFamily: 'var(--font-ui)'
            }}
          >
            {summary?.hasOpenAiApiKey ? (
              <>
                Current key:{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                  {summary.openAiApiKeyMasked}
                </span>
              </>
            ) : (
              'No API key saved yet.'
            )}
          </div>

          <form onSubmit={(e) => void handleSave(e)}>
            <label htmlFor="openai-key" style={labelStyle}>
              {summary?.hasOpenAiApiKey ? 'Replace key' : 'API key'}
            </label>
            <input
              id="openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={inputStyle}
            />
            <p style={helperStyle}>
              Get a key at platform.openai.com. Changes take effect immediately — no restart needed.
            </p>

            {error && (
              <p style={{ fontSize: 12, color: 'var(--terra-500)', margin: '10px 0 0' }}>{error}</p>
            )}
            {flash && !error && (
              <p style={{ fontSize: 12, color: 'var(--olive-500)', margin: '10px 0 0' }}>{flash}</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="submit"
                disabled={submitting || draft.trim().length === 0}
                style={{
                  ...btnPrimary,
                  opacity: submitting || draft.trim().length === 0 ? 0.6 : 1,
                  cursor: submitting || draft.trim().length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? '…' : 'Save key'}
              </button>
              {summary?.hasOpenAiApiKey && (
                <button
                  type="button"
                  onClick={() => void handleClear()}
                  disabled={submitting}
                  style={btnGhost}
                >
                  Remove saved key
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
