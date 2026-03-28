export const CALENDAR_GET_DAY_CHANNEL = 'calendar:get-day'
export const CALENDAR_GET_EVIDENCE_CHANNEL = 'calendar:get-evidence'
export const CALENDAR_CREATE_BLOCK_CHANNEL = 'calendar:create-block'
export const CALENDAR_UPDATE_BLOCK_CHANNEL = 'calendar:update-block'
export const CALENDAR_DELETE_BLOCK_CHANNEL = 'calendar:delete-block'
export const CALENDAR_REDIRECT_BLOCK_CHANNEL = 'calendar:redirect-block'
export const CALENDAR_CONFIRM_ON_TASK_CHANNEL = 'calendar:confirm-on-task'
export const CALENDAR_CHANGED_CHANNEL = 'calendar:changed'

export type AggregationWindowMinutes = 1 | 5 | 10 | 15 | 30 | 60

export type PlannedBlock = {
  id: string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  taskTitle: string
  taskDescription: string | null
  goalSeed: string | null
  startAt: string
  endAt: string
  origin: 'manual' | 'redirect'
  createdAt: string
  updatedAt: string
}

export type ActivitySliceKind = 'activity' | 'afk' | 'gap'

export type ActivitySlice = {
  id: string
  kind: ActivitySliceKind
  startAt: string
  endAt: string
  app: string | null
  title: string | null
  dominance: number | null
  needsReview: boolean
  plannedBlockId: string | null
  onTask: boolean | null
  confidence: number | null
}

export type DayViewData = {
  date: string
  aggregationMinutes: AggregationWindowMinutes
  plannedBlocks: PlannedBlock[]
  activitySlices: ActivitySlice[]
}

export type ActivityEvidenceMinute = {
  minuteTimestamp: string
  summaryStatus: string
  app: string | null
  title: string | null
  windowTitles: string[]
  dominance: number | null
  afk: boolean
  onTask: boolean | null
  confidence: number | null
  reasoning: string | null
}

export type ActivityEvidence = {
  sliceId: string
  startAt: string
  endAt: string
  plannedBlock: PlannedBlock | null
  summary: {
    kind: ActivitySliceKind
    app: string | null
    title: string | null
    onTask: boolean | null
    confidence: number | null
    reasoning: string | null
  }
  minutes: ActivityEvidenceMinute[]
}

export type CalendarChangedListener = (date: string) => void

export type CalendarApi = {
  getDay: (input: {
    date: string
    aggregationMinutes: AggregationWindowMinutes
  }) => Promise<DayViewData>
  getEvidence: (input: {
    startAt: string
    endAt: string
    aggregationMinutes: AggregationWindowMinutes
  }) => Promise<ActivityEvidence>
  createBlock: (input: {
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => Promise<PlannedBlock>
  updateBlock: (input: {
    id: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => Promise<PlannedBlock>
  deleteBlock: (input: { id: string }) => Promise<void>
  redirectBlock: (input: {
    sourceBlockId: string
    splitAt: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }) => Promise<{
    preservedBlock: PlannedBlock
    redirectedBlock: PlannedBlock
  }>
  confirmOnTask: (input: { startAt: string; endAt: string }) => Promise<void>
  onChanged: (listener: CalendarChangedListener) => () => void
}
