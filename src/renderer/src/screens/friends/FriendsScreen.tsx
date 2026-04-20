import { JSX } from 'react'

export default function FriendsScreen(): JSX.Element {
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
          Friends
        </h1>
      </header>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '48px 32px',
            maxWidth: 460,
            border: '1px dashed var(--border2)',
            borderRadius: 'var(--r-md)',
            background: 'var(--surface2)'
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0
            }}
          >
            Coming soon
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              margin: '12px 0 0',
              lineHeight: 1.5
            }}
          >
            This section will be added soon.
          </p>
        </div>
      </div>
    </div>
  )
}
