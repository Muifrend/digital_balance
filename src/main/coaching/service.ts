import { Notification } from 'electron'
import type { CoachingPrompt } from '../../shared/coaching'
import type { DatabaseService } from '../db/service'
import { getLocalDateKey } from '../db/utils'

const PROMPT_COOLDOWN_MS = 15 * 60_000
const ON_TASK_RESET_MINUTES = 5
const OFF_TASK_THRESHOLD_MINUTES = 3
const OFF_TASK_CONFIDENCE_THRESHOLD = 0.75

export type CoachingService = {
  start: () => void
  stop: () => void
  getActivePrompt: () => CoachingPrompt | null
  confirmPrompt: (promptId: string) => void
  dismissPrompt: (promptId: string) => void
  redirectPrompt: (input: {
    promptId: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }) => Promise<void>
  handleMinuteUpdate: (minuteTimestamp: string) => Promise<void>
  onPromptChange: (listener: (prompt: CoachingPrompt | null) => void) => () => void
}

function buildSupportiveAction(input: {
  taskTitle: string
  goalSeed: string | null
  kind: 'off_task' | 'afk'
}): string {
  const normalizedGoalSeed = input.goalSeed?.trim() || null
  if (normalizedGoalSeed) {
    return normalizedGoalSeed
  }

  if (input.kind === 'afk') {
    return `Write down the blocker for "${input.taskTitle}"`
  }

  return `Take the next small step on "${input.taskTitle}"`
}

function isPromptCooldownActive(
  cooldowns: Map<string, number>,
  key: string,
  nowMs: number
): boolean {
  const expiresAt = cooldowns.get(key)
  return typeof expiresAt === 'number' && expiresAt > nowMs
}

export function createCoachingService(options: { database: DatabaseService }): CoachingService {
  const promptListeners = new Set<(prompt: CoachingPrompt | null) => void>()
  const promptCooldowns = new Map<string, number>()
  let activePrompt: CoachingPrompt | null = null
  let unsubscribeCalendarChange: (() => void) | null = null

  function emitPrompt(prompt: CoachingPrompt | null): void {
    activePrompt = prompt
    for (const listener of promptListeners) {
      listener(prompt)
    }
  }

  function maybeShowSystemNotification(prompt: CoachingPrompt): void {
    if (!Notification.isSupported()) {
      return
    }

    const notification = new Notification({
      title: prompt.title,
      body: prompt.body,
      silent: false
    })
    notification.show()
  }

  function clearCooldownIfRecovered(
    blockId: number,
    recentMinutes: Array<{ onTask: boolean | null }>
  ): void {
    if (recentMinutes.length < ON_TASK_RESET_MINUTES) {
      return
    }

    const recovered = recentMinutes
      .slice(-ON_TASK_RESET_MINUTES)
      .every((minute) => minute.onTask === true)
    if (!recovered) {
      return
    }

    promptCooldowns.delete(`off_task:${blockId}`)
    promptCooldowns.delete(`afk:${blockId}`)
  }

  function setPromptCooldown(prompt: CoachingPrompt): void {
    if (!prompt.plannedBlockId) {
      return
    }

    promptCooldowns.set(`${prompt.kind}:${prompt.plannedBlockId}`, Date.now() + PROMPT_COOLDOWN_MS)
  }

  function clearActivePromptIfMatches(promptId: string): void {
    if (activePrompt?.id === promptId) {
      emitPrompt(null)
    }
  }

  async function evaluatePrompt(referenceTime?: string): Promise<void> {
    const snapshot = options.database.getCoachingSnapshot(
      referenceTime ? { referenceTime } : undefined
    )
    const now = referenceTime ? new Date(referenceTime) : new Date()
    const nowMs = now.getTime()

    if (!snapshot.activeBlock) {
      if (activePrompt) {
        emitPrompt(null)
      }
      return
    }

    clearCooldownIfRecovered(snapshot.activeBlock.blockId, snapshot.recentMinutes)

    const lastMinute = snapshot.recentMinutes[snapshot.recentMinutes.length - 1] ?? null
    const afkMinute = lastMinute?.afk ? lastMinute : null

    if (afkMinute) {
      const promptId = `afk:${snapshot.activeBlock.blockId}:${afkMinute.minuteTimestamp}`
      if (!isPromptCooldownActive(promptCooldowns, `afk:${snapshot.activeBlock.blockId}`, nowMs)) {
        const prompt: CoachingPrompt = {
          id: promptId,
          kind: 'afk',
          plannedBlockId: String(snapshot.activeBlock.blockId),
          startAt: afkMinute.minuteTimestamp,
          endAt: new Date(Date.parse(afkMinute.minuteTimestamp) + 60_000).toISOString(),
          title: 'Stuck or taking a breather?',
          body: `You stepped away from "${snapshot.activeBlock.taskTitle}". ${buildSupportiveAction(
            {
              taskTitle: snapshot.activeBlock.taskTitle,
              goalSeed: snapshot.activeBlock.goalSeed,
              kind: 'afk'
            }
          )}.`,
          suggestedAction: buildSupportiveAction({
            taskTitle: snapshot.activeBlock.taskTitle,
            goalSeed: snapshot.activeBlock.goalSeed,
            kind: 'afk'
          }),
          createdAt: new Date().toISOString()
        }

        if (activePrompt?.id !== prompt.id) {
          setPromptCooldown(prompt)
          emitPrompt(prompt)
          maybeShowSystemNotification(prompt)
        }
      }

      return
    }

    const recentOffTaskMinutes = snapshot.recentMinutes
      .filter((minute) => minute.onTask !== null && minute.afk === false)
      .slice(-OFF_TASK_THRESHOLD_MINUTES)

    const shouldPromptOffTask =
      recentOffTaskMinutes.length === OFF_TASK_THRESHOLD_MINUTES &&
      recentOffTaskMinutes.every(
        (minute) =>
          minute.onTask === false && (minute.confidence ?? 0) >= OFF_TASK_CONFIDENCE_THRESHOLD
      )

    if (shouldPromptOffTask) {
      const firstMinute = recentOffTaskMinutes[0]!
      const lastOffTaskMinute = recentOffTaskMinutes[recentOffTaskMinutes.length - 1]!
      const promptId = `off_task:${snapshot.activeBlock.blockId}:${firstMinute.minuteTimestamp}`
      if (
        !isPromptCooldownActive(promptCooldowns, `off_task:${snapshot.activeBlock.blockId}`, nowMs)
      ) {
        const prompt: CoachingPrompt = {
          id: promptId,
          kind: 'off_task',
          plannedBlockId: String(snapshot.activeBlock.blockId),
          startAt: firstMinute.minuteTimestamp,
          endAt: new Date(Date.parse(lastOffTaskMinute.minuteTimestamp) + 60_000).toISOString(),
          title: 'Back to the plan?',
          body: `Your recent activity does not look aligned with "${snapshot.activeBlock.taskTitle}". ${buildSupportiveAction(
            {
              taskTitle: snapshot.activeBlock.taskTitle,
              goalSeed: snapshot.activeBlock.goalSeed,
              kind: 'off_task'
            }
          )}.`,
          suggestedAction: buildSupportiveAction({
            taskTitle: snapshot.activeBlock.taskTitle,
            goalSeed: snapshot.activeBlock.goalSeed,
            kind: 'off_task'
          }),
          createdAt: new Date().toISOString()
        }

        if (activePrompt?.id !== prompt.id) {
          setPromptCooldown(prompt)
          emitPrompt(prompt)
          maybeShowSystemNotification(prompt)
        }
      }

      return
    }

    if (activePrompt) {
      emitPrompt(null)
    }
  }

  function start(): void {
    if (unsubscribeCalendarChange) {
      return
    }

    unsubscribeCalendarChange = options.database.onCalendarChange((date) => {
      if (date === getLocalDateKey(new Date())) {
        void evaluatePrompt()
      }
    })

    void evaluatePrompt()
  }

  function stop(): void {
    unsubscribeCalendarChange?.()
    unsubscribeCalendarChange = null
    if (activePrompt) {
      emitPrompt(null)
    }
  }

  function getActivePrompt(): CoachingPrompt | null {
    return activePrompt
  }

  function confirmPrompt(promptId: string): void {
    if (!activePrompt || activePrompt.id !== promptId) {
      return
    }

    options.database.confirmOnTask({
      startAt: activePrompt.startAt,
      endAt: activePrompt.endAt
    })
    setPromptCooldown(activePrompt)
    clearActivePromptIfMatches(promptId)
  }

  function dismissPrompt(promptId: string): void {
    if (!activePrompt || activePrompt.id !== promptId) {
      return
    }

    setPromptCooldown(activePrompt)
    clearActivePromptIfMatches(promptId)
  }

  async function redirectPrompt(input: {
    promptId: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }): Promise<void> {
    if (!activePrompt || activePrompt.id !== input.promptId || !activePrompt.plannedBlockId) {
      return
    }

    options.database.redirectScheduleBlock({
      sourceBlockId: activePrompt.plannedBlockId,
      splitAt: activePrompt.startAt,
      projectId: input.projectId,
      taskTitle: input.taskTitle,
      taskDescription: input.taskDescription,
      goalSeed: input.goalSeed
    })
    setPromptCooldown(activePrompt)
    clearActivePromptIfMatches(input.promptId)
  }

  function handleMinuteUpdate(minuteTimestamp: string): Promise<void> {
    return evaluatePrompt(new Date(Date.parse(minuteTimestamp) + 60_000).toISOString())
  }

  function onPromptChange(listener: (prompt: CoachingPrompt | null) => void): () => void {
    promptListeners.add(listener)
    return () => {
      promptListeners.delete(listener)
    }
  }

  return {
    start,
    stop,
    getActivePrompt,
    confirmPrompt,
    dismissPrompt,
    redirectPrompt,
    handleMinuteUpdate,
    onPromptChange
  }
}
