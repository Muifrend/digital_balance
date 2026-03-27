import Database from 'better-sqlite3'
import {
  type MinutePersistencePayload,
  type RebuildMinutesProjectionOptions
} from '../pipeline/minute'
import { createClassificationQueue } from './classification-queue'
import { createDatabaseContext } from './context'
import { runDatabaseMigrations } from './migrations'
import { createPersistence, type DatabasePersistence } from './persistence'
import { createProjectionRebuild, type ProjectionRebuild } from './projection-rebuild'
import { prepareStatements, resetPreparedState } from './statements'

export type DatabaseService = {
  initialize: () => void
  persistMinutePayload: (payload: MinutePersistencePayload, logDatabase: boolean) => void
  getPreviousAfkStreak: (minuteTimestamp: string) => number
  rebuildMinutesProjection: (options?: RebuildMinutesProjectionOptions) => void
  startClassificationWorker: () => Promise<void>
  close: () => void
}

export function createDatabaseService(options: {
  databasePath: string
  projectRoot: string
}): DatabaseService {
  const context = createDatabaseContext()
  const classificationQueue = createClassificationQueue(context)
  let persistence: DatabasePersistence | null = null
  let projectionRebuild: ProjectionRebuild | null = null

  function initialize(): void {
    if (context.database) {
      return
    }

    try {
      context.database = new Database(options.databasePath)
      context.database.pragma('journal_mode = WAL')
      runDatabaseMigrations(context.database)
      context.prepared = prepareStatements(context.database)

      classificationQueue.initialize(options.projectRoot)
      persistence = createPersistence(context, classificationQueue)
      projectionRebuild = createProjectionRebuild(context, persistence)
    } catch (error) {
      console.error('[db] Failed to initialize database:', error)
      classificationQueue.stop()
      resetPreparedState(context)
      context.openAiApiKey = null
      context.database = null
      persistence = null
      projectionRebuild = null
    }
  }

  function persistMinutePayload(payload: MinutePersistencePayload, logDatabase: boolean): void {
    persistence?.persistMinutePayload(payload, logDatabase)
  }

  function getPreviousAfkStreak(minuteTimestamp: string): number {
    return persistence?.getPreviousAfkStreak(minuteTimestamp) ?? 0
  }

  function rebuildMinutesProjection(options?: RebuildMinutesProjectionOptions): void {
    projectionRebuild?.rebuildMinutesProjection(options)
  }

  function close(): void {
    classificationQueue.stop()

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
      persistence = null
      projectionRebuild = null
    }
  }

  return {
    initialize,
    persistMinutePayload,
    getPreviousAfkStreak,
    rebuildMinutesProjection,
    startClassificationWorker: classificationQueue.startClassificationWorker,
    close
  }
}
