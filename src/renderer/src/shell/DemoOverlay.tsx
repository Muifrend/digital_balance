import { JSX, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { NavSection } from './TopNav'

export type DemoPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type DemoStep = {
  id: string
  title: string
  body: string
  section?: NavSection
  anchor?: string
  preferredPlacement?: DemoPlacement
}

type DemoOverlayProps = {
  open: boolean
  step: DemoStep
  stepIndex: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onClose: () => void
}

type Rect = {
  top: number
  left: number
  width: number
  height: number
}

type LayoutState = {
  cardTop: number | null
  cardLeft: number | null
  highlightRect: Rect | null
  centered: boolean
}

const overlayButtonBase: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  cursor: 'pointer'
}

const primaryButtonStyle: React.CSSProperties = {
  ...overlayButtonBase,
  border: 'none',
  background: 'var(--olive-500)',
  color: '#fff',
  fontWeight: 500
}

const disabledButtonStyle: React.CSSProperties = {
  ...overlayButtonBase,
  opacity: 0.45,
  cursor: 'not-allowed'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => {
    if (element.hasAttribute('disabled')) return false
    return element.tabIndex >= 0
  })
}

export default function DemoOverlay({
  open,
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onClose
}: DemoOverlayProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<LayoutState>({
    cardTop: null,
    cardLeft: null,
    highlightRect: null,
    centered: true
  })

  const isLastStep = stepIndex === totalSteps - 1

  const primaryActionLabel = isLastStep ? 'Finish' : 'Next'

  const primaryAction = useMemo(() => {
    return isLastStep ? onClose : onNext
  }, [isLastStep, onClose, onNext])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open, step.id])

  useLayoutEffect(() => {
    if (!open) return

    function measureLayout(): void {
      const panel = panelRef.current
      if (!panel) return

      const panelRect = panel.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 16

      if (!step.anchor || step.preferredPlacement === 'center') {
        setLayout({
          cardTop: clamp((viewportHeight - panelRect.height) / 2, margin, viewportHeight - panelRect.height - margin),
          cardLeft: clamp((viewportWidth - panelRect.width) / 2, margin, viewportWidth - panelRect.width - margin),
          highlightRect: null,
          centered: true
        })
        return
      }

      const target = document.querySelector<HTMLElement>(`[data-demo-anchor="${step.anchor}"]`)
      if (!target) {
        setLayout({
          cardTop: clamp((viewportHeight - panelRect.height) / 2, margin, viewportHeight - panelRect.height - margin),
          cardLeft: clamp((viewportWidth - panelRect.width) / 2, margin, viewportWidth - panelRect.width - margin),
          highlightRect: null,
          centered: true
        })
        return
      }

      const rect = target.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        setLayout({
          cardTop: clamp((viewportHeight - panelRect.height) / 2, margin, viewportHeight - panelRect.height - margin),
          cardLeft: clamp((viewportWidth - panelRect.width) / 2, margin, viewportWidth - panelRect.width - margin),
          highlightRect: null,
          centered: true
        })
        return
      }

      const gap = 18
      let cardTop = rect.bottom + gap
      let cardLeft = rect.left

      switch (step.preferredPlacement) {
        case 'top':
          cardTop = rect.top - panelRect.height - gap
          cardLeft = rect.left
          break
        case 'left':
          cardTop = rect.top
          cardLeft = rect.left - panelRect.width - gap
          break
        case 'right':
          cardTop = rect.top
          cardLeft = rect.right + gap
          break
        case 'bottom':
        default:
          cardTop = rect.bottom + gap
          cardLeft = rect.left
          break
      }

      const maxLeft = Math.max(margin, viewportWidth - panelRect.width - margin)
      const maxTop = Math.max(margin, viewportHeight - panelRect.height - margin)

      setLayout({
        cardTop: clamp(cardTop, margin, maxTop),
        cardLeft: clamp(cardLeft, margin, maxLeft),
        highlightRect: {
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16
        },
        centered: false
      })
    }

    const frameId = window.requestAnimationFrame(measureLayout)
    const handleResize = (): void => measureLayout()

    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, step])

  if (!open) return null

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      primaryAction()
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (stepIndex > 0) onBack()
      return
    }

    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      const isNativeControl =
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA'

      if (!isNativeControl) {
        event.preventDefault()
        primaryAction()
      }
      return
    }

    if (event.key === 'Tab') {
      const panel = panelRef.current
      if (!panel) return

      const focusable = getFocusableElements(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? focusable.length - 1
          : currentIndex - 1
        : currentIndex === focusable.length - 1
          ? 0
          : Math.max(0, currentIndex + 1)

      event.preventDefault()
      focusable[nextIndex]?.focus()
    }
  }

  return (
    <div
      aria-hidden="false"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: layout.centered ? 'rgba(28, 24, 18, 0.56)' : 'transparent'
      }}
    >
      {layout.highlightRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: layout.highlightRect.top,
            left: layout.highlightRect.left,
            width: layout.highlightRect.width,
            height: layout.highlightRect.height,
            borderRadius: 'var(--r-md)',
            border: '2px solid rgba(255, 255, 255, 0.72)',
            boxShadow: '0 0 0 9999px rgba(28, 24, 18, 0.56)',
            pointerEvents: 'none'
          }}
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-overlay-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          top: layout.cardTop ?? 16,
          left: layout.cardLeft ?? 16,
          width: 'min(360px, calc(100vw - 32px))',
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 18px 44px rgba(20, 16, 12, 0.28)',
          padding: 20,
          outline: 'none'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)'
              }}
            >
              Demo {stepIndex + 1} / {totalSteps}
            </p>
            <h2
              id="demo-overlay-title"
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                fontWeight: 400,
                color: 'var(--text-primary)'
              }}
            >
              {step.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: 0
            }}
          >
            ×
          </button>
        </div>

        <p
          style={{
            margin: '12px 0 0',
            fontSize: 14,
            color: 'var(--text-secondary)',
            lineHeight: 1.6
          }}
        >
          {step.body}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 18
          }}
        >
          <button type="button" onClick={onClose} style={overlayButtonBase}>
            Skip
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onBack}
              disabled={stepIndex === 0}
              style={stepIndex === 0 ? disabledButtonStyle : overlayButtonBase}
            >
              Back
            </button>
            <button type="button" onClick={primaryAction} style={primaryButtonStyle}>
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
