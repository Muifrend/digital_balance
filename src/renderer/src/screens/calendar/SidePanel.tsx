import { JSX } from 'react'

type SidePanelProps = {
  width?: number
  children: React.ReactNode
}

/** Outer shell shared by EvidenceDrawer and BlockEditor. */
export default function SidePanel({ width = 340, children }: SidePanelProps): JSX.Element {
  return (
    <div
      style={{
        width,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {children}
    </div>
  )
}
