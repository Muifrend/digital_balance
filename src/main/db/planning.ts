import type { PlannedBlock } from '../../shared/calendar'
import type { ProjectRecord } from '../../shared/projects'
import type { DatabaseContext, DatabaseWriteResult, MinuteRowLookup } from './context'
import {
  assertSingleDayRange,
  buildGoalVersion,
  ensureIsoTimestamp,
  getLocalDateKey,
  mapProjectRow,
  mapScheduleBlockRow,
  normalizeTimestamp,
  parseNumericId,
  type PlannedContext,
  type ProjectRow,
  type ScheduleBlockRow
} from './utils'

const MANUAL_CONFIRM_MODEL = 'manual-confirm'
const MANUAL_CONFIRM_PROMPT_VERSION = 'manual-confirm-v1'
const MANUAL_CONFIRM_CLASSIFIER_VERSION = 'manual-confirm-v1'

type MinuteConfirmationRow = {
  id: number
  timestamp: string
}

type ExistingBlockRow = {
  start_at: string
  end_at: string
}

export type PlanningDatabase = {
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
  listScheduleBlocksForRange: (input: { startAt: string; endAt: string }) => PlannedBlock[]
  getPlannedContextForTimestamp: (timestamp: string) => PlannedContext | null
  confirmOnTask: (input: { startAt: string; endAt: string }) => void
}

function normalizeTaskTitle(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Task title is required')
  }

  return normalized
}

function normalizeProjectId(value: string | null): number | null {
  return value === null ? null : parseNumericId(value, 'project')
}

function validateRange(
  startAtInput: string,
  endAtInput: string
): {
  startAt: string
  endAt: string
} {
  const startAt = ensureIsoTimestamp(startAtInput, 'startAt')
  const endAt = ensureIsoTimestamp(endAtInput, 'endAt')
  if (startAt >= endAt) {
    throw new Error('Schedule blocks must have startAt before endAt')
  }

  assertSingleDayRange(startAt, endAt)
  return { startAt, endAt }
}

export function createPlanningDatabase(
  context: DatabaseContext,
  notifyCalendarChanged: (date: string) => void
): PlanningDatabase {
  if (!context.database) {
    throw new Error('Database not initialized')
  }

  const listProjectsStatement = context.database.prepare(`
    SELECT id, name, description, color, archived, created_at, updated_at
    FROM projects
    ORDER BY archived ASC, name COLLATE NOCASE ASC, id ASC
  `)
  const createProjectStatement = context.database.prepare(`
    INSERT INTO projects (name, description, color, archived, created_at, updated_at)
    VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))
  `)
  const updateProjectStatement = context.database.prepare(`
    UPDATE projects
    SET name = ?, description = ?, color = ?, updated_at = datetime('now')
    WHERE id = ?
  `)
  const archiveProjectStatement = context.database.prepare(`
    UPDATE projects
    SET archived = ?, updated_at = datetime('now')
    WHERE id = ?
  `)
  const selectProjectStatement = context.database.prepare(`
    SELECT id, name, description, color, archived, created_at, updated_at
    FROM projects
    WHERE id = ?
  `)
  const selectProjectExistsStatement = context.database.prepare(
    'SELECT id FROM projects WHERE id = ?'
  )
  const createScheduleBlockStatement = context.database.prepare(`
    INSERT INTO schedule_blocks (
      project_id,
      task_title,
      task_description,
      goal_seed,
      start_at,
      end_at,
      origin,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `)
  const updateScheduleBlockStatement = context.database.prepare(`
    UPDATE schedule_blocks
    SET project_id = ?,
        task_title = ?,
        task_description = ?,
        goal_seed = ?,
        start_at = ?,
        end_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `)
  const deleteScheduleBlockStatement = context.database.prepare(
    'DELETE FROM schedule_blocks WHERE id = ?'
  )
  const selectScheduleBlockStatement = context.database.prepare(`
    SELECT
      schedule_blocks.id,
      schedule_blocks.project_id,
      projects.name AS project_name,
      projects.color AS project_color,
      schedule_blocks.task_title,
      schedule_blocks.task_description,
      schedule_blocks.goal_seed,
      schedule_blocks.start_at,
      schedule_blocks.end_at,
      schedule_blocks.origin,
      schedule_blocks.created_at,
      schedule_blocks.updated_at
    FROM schedule_blocks
    LEFT JOIN projects ON projects.id = schedule_blocks.project_id
    WHERE schedule_blocks.id = ?
  `)
  const selectOverlappingBlockStatement = context.database.prepare(`
    SELECT id, start_at, end_at
    FROM schedule_blocks
    WHERE start_at < ?
      AND end_at > ?
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `)
  const listScheduleBlocksInRangeStatement = context.database.prepare(`
    SELECT
      schedule_blocks.id,
      schedule_blocks.project_id,
      projects.name AS project_name,
      projects.color AS project_color,
      schedule_blocks.task_title,
      schedule_blocks.task_description,
      schedule_blocks.goal_seed,
      schedule_blocks.start_at,
      schedule_blocks.end_at,
      schedule_blocks.origin,
      schedule_blocks.created_at,
      schedule_blocks.updated_at
    FROM schedule_blocks
    LEFT JOIN projects ON projects.id = schedule_blocks.project_id
    WHERE schedule_blocks.end_at > ?
      AND schedule_blocks.start_at < ?
    ORDER BY schedule_blocks.start_at ASC, schedule_blocks.id ASC
  `)
  const selectPlannedContextStatement = context.database.prepare(`
    SELECT
      schedule_blocks.id,
      schedule_blocks.project_id,
      projects.name AS project_name,
      projects.color AS project_color,
      schedule_blocks.task_title,
      schedule_blocks.task_description,
      schedule_blocks.goal_seed,
      schedule_blocks.start_at,
      schedule_blocks.end_at,
      schedule_blocks.origin,
      schedule_blocks.created_at,
      schedule_blocks.updated_at
    FROM schedule_blocks
    LEFT JOIN projects ON projects.id = schedule_blocks.project_id
    WHERE schedule_blocks.start_at <= ?
      AND schedule_blocks.end_at > ?
    ORDER BY schedule_blocks.start_at DESC, schedule_blocks.id DESC
    LIMIT 1
  `)
  const listMinuteRowsForConfirmationStatement = context.database.prepare(`
    SELECT id, timestamp
    FROM minutes
    WHERE timestamp >= ?
      AND timestamp < ?
    ORDER BY timestamp ASC
  `)
  const insertCorrectedClassificationStatement = context.database.prepare(`
    INSERT OR IGNORE INTO classifications (
      minute_id,
      minute_timestamp,
      planned_block_id,
      on_task,
      confidence,
      reasoning,
      corrected,
      model_name,
      prompt_version,
      classifier_version,
      goal_version,
      goal_title,
      goal_description
    )
    VALUES (?, ?, ?, 1, 1, 'Confirmed on task by user', 1, ?, ?, ?, ?, ?, ?)
  `)

  function requireProject(projectId: number | null): void {
    if (projectId === null) {
      return
    }

    const existingProject = selectProjectExistsStatement.get(projectId) as
      | MinuteRowLookup
      | undefined
    if (!existingProject) {
      throw new Error(`Project ${projectId} does not exist`)
    }
  }

  function assertNoOverlap(startAt: string, endAt: string, excludeId: number | null = null): void {
    const overlappingBlock = selectOverlappingBlockStatement.get(
      endAt,
      startAt,
      excludeId,
      excludeId
    ) as ExistingBlockRow | undefined

    if (overlappingBlock) {
      throw new Error('Schedule blocks cannot overlap')
    }
  }

  function getScheduleBlockById(id: number): PlannedBlock {
    const row = selectScheduleBlockStatement.get(id) as ScheduleBlockRow | undefined
    if (!row) {
      throw new Error(`Schedule block ${id} does not exist`)
    }

    return mapScheduleBlockRow(row)
  }

  function listProjects(): ProjectRecord[] {
    return (listProjectsStatement.all() as ProjectRow[]).map(mapProjectRow)
  }

  function createProject(input: {
    name: string
    description: string | null
    color: string | null
  }): ProjectRecord {
    const normalizedName = input.name.trim()
    if (!normalizedName) {
      throw new Error('Project name is required')
    }

    const result = createProjectStatement.run(
      normalizedName,
      input.description,
      input.color
    ) as DatabaseWriteResult

    const row = selectProjectStatement.get(Number(result.lastInsertRowid)) as ProjectRow | undefined
    if (!row) {
      throw new Error('Failed to load created project')
    }

    return mapProjectRow(row)
  }

  function updateProject(input: {
    id: string
    name: string
    description: string | null
    color: string | null
  }): ProjectRecord {
    const projectId = parseNumericId(input.id, 'project')
    const normalizedName = input.name.trim()
    if (!normalizedName) {
      throw new Error('Project name is required')
    }

    const result = updateProjectStatement.run(
      normalizedName,
      input.description,
      input.color,
      projectId
    ) as DatabaseWriteResult

    if (result.changes === 0) {
      throw new Error(`Project ${projectId} does not exist`)
    }

    const row = selectProjectStatement.get(projectId) as ProjectRow | undefined
    if (!row) {
      throw new Error(`Project ${projectId} does not exist`)
    }

    return mapProjectRow(row)
  }

  function archiveProject(input: { id: string; archived: boolean }): void {
    const projectId = parseNumericId(input.id, 'project')
    const result = archiveProjectStatement.run(
      input.archived ? 1 : 0,
      projectId
    ) as DatabaseWriteResult
    if (result.changes === 0) {
      throw new Error(`Project ${projectId} does not exist`)
    }
  }

  function createScheduleBlock(input: {
    projectId: string | null
    taskTitle: string
    taskDescription: string | null
    goalSeed: string | null
    startAt: string
    endAt: string
  }): PlannedBlock {
    const { startAt, endAt } = validateRange(input.startAt, input.endAt)
    const projectId = normalizeProjectId(input.projectId)
    requireProject(projectId)
    assertNoOverlap(startAt, endAt)

    const result = createScheduleBlockStatement.run(
      projectId,
      normalizeTaskTitle(input.taskTitle),
      input.taskDescription,
      input.goalSeed,
      startAt,
      endAt,
      'manual'
    ) as DatabaseWriteResult

    const createdBlock = getScheduleBlockById(Number(result.lastInsertRowid))
    notifyCalendarChanged(getLocalDateKey(startAt))
    return createdBlock
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
    const blockId = parseNumericId(input.id, 'schedule block')
    const existingBlock = getScheduleBlockById(blockId)
    const { startAt, endAt } = validateRange(input.startAt, input.endAt)
    const projectId = normalizeProjectId(input.projectId)
    requireProject(projectId)
    assertNoOverlap(startAt, endAt, blockId)

    const result = updateScheduleBlockStatement.run(
      projectId,
      normalizeTaskTitle(input.taskTitle),
      input.taskDescription,
      input.goalSeed,
      startAt,
      endAt,
      blockId
    ) as DatabaseWriteResult

    if (result.changes === 0) {
      throw new Error(`Schedule block ${blockId} does not exist`)
    }

    const updatedBlock = getScheduleBlockById(blockId)
    const changedDates = new Set([getLocalDateKey(existingBlock.startAt), getLocalDateKey(startAt)])
    for (const date of changedDates) {
      notifyCalendarChanged(date)
    }
    return updatedBlock
  }

  function deleteScheduleBlock(input: { id: string }): void {
    const blockId = parseNumericId(input.id, 'schedule block')
    const existingBlock = getScheduleBlockById(blockId)
    const result = deleteScheduleBlockStatement.run(blockId) as DatabaseWriteResult
    if (result.changes === 0) {
      throw new Error(`Schedule block ${blockId} does not exist`)
    }

    notifyCalendarChanged(getLocalDateKey(existingBlock.startAt))
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
    const sourceBlockId = parseNumericId(input.sourceBlockId, 'schedule block')
    const sourceBlock = getScheduleBlockById(sourceBlockId)
    const splitAt = ensureIsoTimestamp(input.splitAt, 'splitAt')

    if (splitAt <= sourceBlock.startAt || splitAt >= sourceBlock.endAt) {
      throw new Error('splitAt must fall inside the source block')
    }

    const projectId = normalizeProjectId(input.projectId)
    requireProject(projectId)

    const transaction = context.database!.transaction(() => {
      updateScheduleBlockStatement.run(
        sourceBlock.projectId === null ? null : Number(sourceBlock.projectId),
        sourceBlock.taskTitle,
        sourceBlock.taskDescription,
        sourceBlock.goalSeed,
        sourceBlock.startAt,
        splitAt,
        sourceBlockId
      )

      const insertedBlock = createScheduleBlockStatement.run(
        projectId,
        normalizeTaskTitle(input.taskTitle),
        input.taskDescription,
        input.goalSeed,
        splitAt,
        sourceBlock.endAt,
        'redirect'
      ) as DatabaseWriteResult

      return {
        preservedBlock: getScheduleBlockById(sourceBlockId),
        redirectedBlock: getScheduleBlockById(Number(insertedBlock.lastInsertRowid))
      }
    })

    const result = transaction()
    notifyCalendarChanged(getLocalDateKey(splitAt))
    return result
  }

  function listScheduleBlocksForRange(input: { startAt: string; endAt: string }): PlannedBlock[] {
    const startAt = ensureIsoTimestamp(input.startAt, 'startAt')
    const endAt = ensureIsoTimestamp(input.endAt, 'endAt')
    return (listScheduleBlocksInRangeStatement.all(startAt, endAt) as ScheduleBlockRow[]).map(
      mapScheduleBlockRow
    )
  }

  function getPlannedContextForTimestamp(timestampInput: string): PlannedContext | null {
    const timestamp = ensureIsoTimestamp(timestampInput, 'timestamp')
    const row = selectPlannedContextStatement.get(timestamp, timestamp) as
      | ScheduleBlockRow
      | undefined
    if (!row) {
      return null
    }

    return {
      blockId: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      projectColor: row.project_color,
      taskTitle: row.task_title,
      taskDescription: row.task_description,
      goalSeed: row.goal_seed,
      startAt: normalizeTimestamp(row.start_at),
      endAt: normalizeTimestamp(row.end_at),
      origin: row.origin
    }
  }

  function confirmOnTask(input: { startAt: string; endAt: string }): void {
    const startAt = ensureIsoTimestamp(input.startAt, 'startAt')
    const endAt = ensureIsoTimestamp(input.endAt, 'endAt')
    if (startAt >= endAt) {
      throw new Error('confirmOnTask requires startAt before endAt')
    }

    const minuteRows = listMinuteRowsForConfirmationStatement.all(
      startAt,
      endAt
    ) as MinuteConfirmationRow[]

    const changedDates = new Set<string>()
    for (const minuteRow of minuteRows) {
      const plannedContext = getPlannedContextForTimestamp(minuteRow.timestamp)
      if (!plannedContext) {
        continue
      }

      const goalVersion = buildGoalVersion({
        taskTitle: plannedContext.taskTitle,
        taskDescription: plannedContext.taskDescription,
        goalSeed: plannedContext.goalSeed,
        projectName: plannedContext.projectName
      })

      insertCorrectedClassificationStatement.run(
        minuteRow.id,
        minuteRow.timestamp,
        plannedContext.blockId,
        MANUAL_CONFIRM_MODEL,
        MANUAL_CONFIRM_PROMPT_VERSION,
        MANUAL_CONFIRM_CLASSIFIER_VERSION,
        goalVersion,
        plannedContext.taskTitle,
        plannedContext.taskDescription ?? ''
      )
      changedDates.add(getLocalDateKey(minuteRow.timestamp))
    }

    for (const date of changedDates) {
      notifyCalendarChanged(date)
    }
  }

  return {
    listProjects,
    createProject,
    updateProject,
    archiveProject,
    createScheduleBlock,
    updateScheduleBlock,
    deleteScheduleBlock,
    redirectScheduleBlock,
    listScheduleBlocksForRange,
    getPlannedContextForTimestamp,
    confirmOnTask
  }
}
