import { JSX, useEffect, useState } from 'react'
import type {
  ActivityEvidence,
  ActivitySlice,
  AggregationWindowMinutes
} from '../../../../shared/calendar'
import { formatMinute, isoToMinuteOfDay } from './TimeGrid'

type EvidenceDrawerProps = {
  slice: ActivitySlice
  aggregationMinutes: AggregationWindowMinutes
  onClose: () => void
  onConfirmOnTask: (startAt: string, endAt: string) => Promise<void>
  onRedirect: (sourceBlockId: string, splitAt: string) => void
}

function ClassificationBadge({
  onTask
}: {
  onTask: boolean | null
}): JSX.Element {
  if (onTask === true) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--olive-100)',
          color: 'var(--olive-600)',
          fontSize: 11,
          fontWeight: 500
        }}
      >
        On task
      </span>
    )
  }
  if (onTask === false) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--amber-100)',
          color: 'var(--amber-400)',
          fontSize: 11,
          fontWeight: 500
        }}
      >
        Off task
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--bg3)',
        color: 'var(--text-tertiary)',
        fontSize: 11,
        fontWeight: 500
      }}
    >
      Unclassified
    </span>
  )
}

export default function EvidenceDrawer({
  slice,
  aggregationMinutes,
  onClose,
  onConfirmOnTask,
  onRedirect
}: EvidenceDrawerProps): JSX.Element {
  const [evidence, setEvidence] = useState<ActivityEvidence | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    void window.api.calendar
      .getEvidence({ startAt: slice.startAt, endAt: slice.endAt, aggregationMinutes })
      .then((ev) => {
        setEvidence(ev)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load evidence')
        setLoading(false)
      })
  }, [slice.id, slice.startAt, slice.endAt, aggregationMinutes])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleConfirm(): Promise<void> {
    setConfirming(true)
    try {
      await onConfirmOnTask(slice.startAt, slice.endAt)
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  const timeLabel = `${formatMinute(isoToMinuteOfDay(slice.startAt))} – ${formatMinute(isoToMinuteOfDay(slice.endAt))}`

  return (
    <div
      style={{
        width: 340,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0
            }}
          >
            {timeLabel}
          </h2>
          {slice.kind !== 'gap' && slice.app && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {slice.app}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 18,
            lineHeight: 1,
            padding: 4
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading evidence…</p>
        )}
        {error && (
          <p style={{ fontSize: 13, color: 'var(--terra-500)' }}>{error}</p>
        )}

        {evidence && (
          <>
            {/* Planned block context */}
            {evidence.plannedBlock && (
              <section>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    margin: '0 0 6px'
                  }}
                >
                  Planned
                </p>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                  {evidence.plannedBlock.taskTitle}
                </p>
                {evidence.plannedBlock.projectName && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                    {evidence.plannedBlock.projectName}
                  </p>
                )}
              </section>
            )}

            {/* Classification summary */}
            <section>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 6px'
                }}
              >
                Classification
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClassificationBadge onTask={evidence.summary.onTask} />
                {evidence.summary.confidence != null && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {Math.round(evidence.summary.confidence * 100)}% confidence
                  </span>
                )}
              </div>
              {evidence.summary.reasoning && (
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    margin: '8px 0 0'
                  }}
                >
                  {evidence.summary.reasoning}
                </p>
              )}
            </section>

            {/* Minute-by-minute list */}
            <section>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  margin: '0 0 6px'
                }}
              >
                Minutes
              </p>
              {evidence.minutes.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                  No minute records captured for this period.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {evidence.minutes.map((m) => {
                    // Derive the best available label for what was happening this minute.
                    // Priority: AFK flag → dominant app → window title → first captured window title → status hint.
                    const primaryLabel = m.afk
                      ? 'AFK'
                      : m.app ?? m.title ?? m.windowTitles[0] ?? null

                    const statusHint =
                      !primaryLabel
                        ? m.summaryStatus === 'no_winner'
                          ? 'No dominant app'
                          : m.summaryStatus === 'afk'
                            ? 'AFK'
                            : 'No capture'
                        : null

                    // Show a secondary line when there's a title distinct from the app.
                    const secondaryLabel =
                      primaryLabel && m.title && m.title !== primaryLabel ? m.title : null

                    return (
                      <div
                        key={m.minuteTimestamp}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '4px 8px',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--bg)'
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                            minWidth: 36,
                            paddingTop: 1
                          }}
                        >
                          {formatMinute(isoToMinuteOfDay(m.minuteTimestamp))}
                        </span>
                        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: primaryLabel ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                              display: 'block',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {primaryLabel ?? statusHint}
                          </span>
                          {secondaryLabel && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--text-tertiary)',
                                display: 'block',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis'
                              }}
                            >
                              {secondaryLabel}
                            </span>
                          )}
                        </div>
                        <ClassificationBadge onTask={m.onTask} />
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Footer actions */}
      {evidence && slice.kind === 'activity' && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8
          }}
        >
          {evidence.summary.onTask !== true && (
            <button
              onClick={() => void handleConfirm()}
              disabled={confirming}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 'var(--r-md)',
                border: 'none',
                cursor: confirming ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 500,
                background: 'var(--olive-500)',
                color: '#fff',
                opacity: confirming ? 0.6 : 1
              }}
            >
              Confirm on task
            </button>
          )}
          {evidence.plannedBlock && (
            <button
              onClick={() =>
                onRedirect(evidence.plannedBlock!.id, slice.startAt)
              }
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 400,
                background: 'transparent',
                color: 'var(--text-secondary)'
              }}
            >
              Redirect →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
