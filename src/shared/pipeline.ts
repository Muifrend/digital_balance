export const PIPELINE_GET_STATUS_CHANNEL = 'pipeline:get-status'
export const PIPELINE_STATUS_CHANNEL = 'pipeline:status'

export type PipelinePhase = 'idle' | 'reconciling' | 'error'
export type PipelineTrigger = 'startup' | 'scheduled' | 'manual'

export type PipelineStatus = {
  phase: PipelinePhase
  trigger: PipelineTrigger
  rangeStart: string | null
  rangeEnd: string | null
  startedAt: string | null
  lastCompletedAt: string | null
  lastError: string | null
}

export type PipelineStatusListener = (status: PipelineStatus) => void

export type PipelineApi = {
  getStatus: () => Promise<PipelineStatus>
  onStatus: (listener: PipelineStatusListener) => () => void
}

export function createInitialPipelineStatus(): PipelineStatus {
  return {
    phase: 'idle',
    trigger: 'startup',
    rangeStart: null,
    rangeEnd: null,
    startedAt: null,
    lastCompletedAt: null,
    lastError: null
  }
}
