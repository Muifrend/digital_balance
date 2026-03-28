export const COACHING_GET_ACTIVE_CHANNEL = 'coaching:get-active'
export const COACHING_STATUS_CHANNEL = 'coaching:status'
export const COACHING_CONFIRM_CHANNEL = 'coaching:confirm'
export const COACHING_DISMISS_CHANNEL = 'coaching:dismiss'
export const COACHING_REDIRECT_CHANNEL = 'coaching:redirect'

export type CoachingPromptKind = 'off_task' | 'afk'

export type CoachingPrompt = {
  id: string
  kind: CoachingPromptKind
  plannedBlockId: string | null
  startAt: string
  endAt: string
  title: string
  body: string
  suggestedAction: string | null
  createdAt: string
}

export type CoachingPromptListener = (prompt: CoachingPrompt | null) => void

export type CoachingApi = {
  getActive: () => Promise<CoachingPrompt | null>
  onPrompt: (listener: CoachingPromptListener) => () => void
  confirm: (input: { promptId: string }) => Promise<void>
  dismiss: (input: { promptId: string }) => Promise<void>
  redirect: (input: {
    promptId: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }) => Promise<void>
}
