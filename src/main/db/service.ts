import Database from 'better-sqlite3'
import type { DaySummary, WeekSummary } from '../../shared/analytics'
import type {
  ActivityEvidence,
  AggregationWindowMinutes,
  DayViewData,
  PlannedBlock
} from '../../shared/calendar'
import type { ProjectRecord } from '../../shared/projects'
import {
  type MinutePersistencePayload,
  type RebuildMinutesProjectionOptions
} from '../pipeline/minute'
import { createAnalyticsDatabase, type AnalyticsDatabase } from './analytics'
import { createClassificationQueue, type ClassificationQueue } from './classification-queue'
import { createDatabaseContext } from './context'
import { createDayViewDatabase, type CoachingSnapshot, type DayViewDatabase } from './day-view'
import { runDatabaseMigrations } from './migrations'
import { createPersistence, type DatabasePersistence } from './persistence'
import { createPlanningDatabase, type PlanningDatabase } from './planning'
import { createProjectionRebuild, type ProjectionRebuild } from './projection-rebuild'
import { prepareStatements, resetPreparedState } from './statements'

export type DatabaseService = {
  initialize: () => void
  getInitializationError: () => string | null
  persistMinutePayload: (payload: MinutePersistencePayload, logDatabase: boolean) => void
  getPreviousAfkStreak: (minuteTimestamp: string) => number
  rebuildMinutesProjection: (options?: RebuildMinutesProjectionOptions) => void
  startClassificationWorker: () => Promise<void>
  listProjects: () => ProjectRecord[]
  createProject: (input: {
    name: string
    description: string | null
    color: string | null
  }) => ProjectRecord
  updateProject: (input: {
    id: string
    name: string
    description: string | null
    color: string | null
  }) => ProjectRecord
  archiveProject: (input: { id: string; archived: boolean }) => void
  createScheduleBlock: (input: {
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => PlannedBlock
  updateScheduleBlock: (input: {
    id: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }) => PlannedBlock
  deleteScheduleBlock: (input: { id: string }) => void
  redirectScheduleBlock: (input: {
    sourceBlockId: string
    splitAt: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }) => {
    preservedBlock: PlannedBlock
    redirectedBlock: PlannedBlock
  }
  getDayViewData: (input: {
    date: string
    aggregationMinutes: AggregationWindowMinutes
  }) => DayViewData
  getActivityEvidence: (input: {
    startAt: string
    endAt: string
    aggregationMinutes: AggregationWindowMinutes
  }) => ActivityEvidence
  confirmOnTask: (input: { startAt: string; endAt: string }) => void
  getCoachingSnapshot: (input?: { referenceTime?: string }) => CoachingSnapshot
  getAnalyticsDay: (input: { date: string }) => DaySummary
  getAnalyticsWeek: (input: { endDate: string }) => WeekSummary
  setOpenAiApiKey: (apiKey: string | null) => void
  getOpenAiApiKey: () => string | null
  onCalendarChange: (listener: (date: string) => void) => () => void
  close: () => void
}

export function createDatabaseService(options: {
  databasePath: string
  projectRoot: string
}): DatabaseService {
  const context = createDatabaseContext()
  const calendarChangeListeners = new Set<(date: string) => void>()
  let lastInitializationError: string | null = null
  let classificationQueue: ClassificationQueue | null = null
  let persistence: DatabasePersistence | null = null
  let projectionRebuild: ProjectionRebuild | null = null
  let planning: PlanningDatabase | null = null
  let dayView: DayViewDatabase | null = null
  let analytics: AnalyticsDatabase | null = null

  function notifyCalendarChanged(date: string): void {
    for (const listener of calendarChangeListeners) {
      listener(date)
    }
  }

  function throwDatabaseNotInitialized(): never {
    if (lastInitializationError) {
      throw new Error(`Database not initialized: ${lastInitializationError}`)
    }

    throw new Error('Database not initialized')
  }

  function initialize(): void {
    if (context.database) {
      return
    }

    try {
      lastInitializationError = null
      context.database = new Database(options.databasePath)
      context.database.pragma('journal_mode = WAL')
      runDatabaseMigrations(context.database)
      context.prepared = prepareStatements(context.database)

      planning = createPlanningDatabase(context, notifyCalendarChanged)
      classificationQueue = createClassificationQueue(context, {
        getPlannedContextForTimestamp: planning.getPlannedContextForTimestamp,
        notifyCalendarChanged
      })
      classificationQueue.initialize(options.projectRoot)
      persistence = createPersistence(context, classificationQueue, notifyCalendarChanged)
      projectionRebuild = createProjectionRebuild(context, persistence)
      dayView = createDayViewDatabase(context, planning)
      analytics = createAnalyticsDatabase(context)
    } catch (error) {
      console.error('[db] Failed to initialize database:', error)
      lastInitializationError = error instanceof Error ? error.message : String(error)
      classificationQueue?.stop()
      resetPreparedState(context)
      context.openAiApiKey = null
      context.database = null
      classificationQueue = null
      persistence = null
      projectionRebuild = null
      planning = null
      dayView = null
      analytics = null
    }
  }

  function persistMinutePayload(payload: MinutePersistencePayload, logDatabase: boolean): void {
    persistence?.persistMinutePayload(payload, logDatabase)
  }

  function getInitializationError(): string | null {
    return lastInitializationError
  }

  function getPreviousAfkStreak(minuteTimestamp: string): number {
    return persistence?.getPreviousAfkStreak(minuteTimestamp) ?? 0
  }

  function rebuildMinutesProjection(options?: RebuildMinutesProjectionOptions): void {
    projectionRebuild?.rebuildMinutesProjection(options)
  }

  function startClassificationWorker(): Promise<void> {
    return classificationQueue?.startClassificationWorker() ?? Promise.resolve()
  }

  function listProjects(): ProjectRecord[] {
    return planning?.listProjects() ?? []
  }

  function createProject(input: {
    name: string
    description: string | null
    color: string | null
  }): ProjectRecord {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    return planning.createProject(input)
  }

  function updateProject(input: {
    id: string
    name: string
    description: string | null
    color: string | null
  }): ProjectRecord {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    return planning.updateProject(input)
  }

  function archiveProject(input: { id: string; archived: boolean }): void {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    planning.archiveProject(input)
  }

  function createScheduleBlock(input: {
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }): PlannedBlock {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    return planning.createScheduleBlock(input)
  }

  function updateScheduleBlock(input: {
    id: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }): PlannedBlock {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    return planning.updateScheduleBlock(input)
  }

  function deleteScheduleBlock(input: { id: string }): void {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    planning.deleteScheduleBlock(input)
  }

  function redirectScheduleBlock(input: {
    sourceBlockId: string
    splitAt: string
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
  }): {
    preservedBlock: PlannedBlock
    redirectedBlock: PlannedBlock
  } {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    return planning.redirectScheduleBlock(input)
  }

  function getDayViewData(input: {
    date: string
    aggregationMinutes: AggregationWindowMinutes
  }): DayViewData {
    if (!dayView) {
      throwDatabaseNotInitialized()
    }

    return dayView.getDayViewData(input)
  }

  function getActivityEvidence(input: {
    startAt: string
    endAt: string
    aggregationMinutes: AggregationWindowMinutes
  }): ActivityEvidence {
    if (!dayView) {
      throwDatabaseNotInitialized()
    }

    return dayView.getActivityEvidence(input)
  }

  function confirmOnTask(input: { startAt: string; endAt: string }): void {
    if (!planning) {
      throwDatabaseNotInitialized()
    }

    planning.confirmOnTask(input)
  }

  function getCoachingSnapshot(input?: { referenceTime?: string }): CoachingSnapshot {
    if (!dayView) {
      return {
        activeBlock: null,
        recentMinutes: []
      }
    }

    return dayView.getCoachingSnapshot(input)
  }

  function getAnalyticsDay(input: { date: string }): DaySummary {
    if (!analytics) {
      throwDatabaseNotInitialized()
    }

    return analytics.getDaySummary(input)
  }

  function getAnalyticsWeek(input: { endDate: string }): WeekSummary {
    if (!analytics) {
      throwDatabaseNotInitialized()
    }

    return analytics.getWeekSummary(input)
  }

  function setOpenAiApiKey(apiKey: string | null): void {
    classificationQueue?.setOpenAiApiKey(apiKey)
  }

  function getOpenAiApiKey(): string | null {
    return context.openAiApiKey
  }

  function onCalendarChange(listener: (date: string) => void): () => void {
    calendarChangeListeners.add(listener)
    return () => {
      calendarChangeListeners.delete(listener)
    }
  }

  function close(): void {
    classificationQueue?.stop()

    if (!context.database) {
      return
    }

    try {
      context.database.close()
    } catch (error) {
      console.error('[db] Failed to close database:', error)
    } finally {
      resetPreparedState(context)
      context.openAiApiKey = null
      context.database = null
      lastInitializationError = null
      classificationQueue = null
      persistence = null
      projectionRebuild = null
      planning = null
      dayView = null
      analytics = null
    }
  }

  return {
    initialize,
    getInitializationError,
    persistMinutePayload,
    getPreviousAfkStreak,
    rebuildMinutesProjection,
    startClassificationWorker,
    listProjects,
    createProject,
    updateProject,
    archiveProject,
    createScheduleBlock,
    updateScheduleBlock,
    deleteScheduleBlock,
    redirectScheduleBlock,
    getDayViewData,
    getActivityEvidence,
    confirmOnTask,
    getCoachingSnapshot,
    getAnalyticsDay,
    getAnalyticsWeek,
    setOpenAiApiKey,
    getOpenAiApiKey,
    onCalendarChange,
    close
  }
}
