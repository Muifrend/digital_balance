import { JSX } from 'react'

type CloseButtonProps = {
  onClick: () => void
}

export default function CloseButton({ onClick }: CloseButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-tertiary)',
        fontSize: 18,
        lineHeight: 1,
        padding: 4,
        flexShrink: 0
      }}
    >
      ×
    </button>
  )
}
