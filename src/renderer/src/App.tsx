import { JSX, useEffect, useState } from 'react'
import { createInitialPipelineStatus, type PipelineStatus } from '../../shared/pipeline'

function App(): JSX.Element {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(
    createInitialPipelineStatus()
  )

  useEffect(() => {
    let isMounted = true

    void window.api.pipeline
      .getStatus()
      .then((status) => {
        if (isMounted) {
          setPipelineStatus(status)
        }
      })
      .catch((error) => {
        console.error('[pipeline] Failed to read initial status:', error)
      })

    const unsubscribe = window.api.pipeline.onStatus((status) => {
      setPipelineStatus(status)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {pipelineStatus.phase === 'reconciling' ? (
          <div className="inline-flex w-fit items-center gap-3 rounded-full border border-amber-300/25 bg-amber-200/10 px-4 py-2 text-sm text-amber-100 shadow-sm shadow-black/20">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-100/35 border-t-amber-100" />
            <span>Syncing past activity...</span>
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Digital Balance</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Digital Balance</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">
            Activity ingestion is running in the Electron main process while the UI stays
            interactive.
          </p>
        </section>
      </div>
    </main>
  )
}

export default App
