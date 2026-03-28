import { createHash } from 'crypto'
import type { PlannedBlock } from '../../shared/calendar'
import type { ProjectRecord } from '../../shared/projects'

export type ProjectRow = {
  id: number
  name: string
  description: string | null
  color: string | null
  archived: number
  created_at: string
  updated_at: string
}

export type ScheduleBlockRow = {
  id: number
  project_id: number | null
  project_name: string | null
  project_color: string | null
  task_title: string
  task_description: string | null
  goal_seed: string | null
  start_at: string
  end_at: string
  origin: 'manual' | 'redirect'
  created_at: string
  updated_at: string
}

export type PlannedContext = {
  blockId: number
  projectId: number | null
  projectName: string | null
  projectColor: string | null
  taskTitle: string
  taskDescription: string | null
  goalSeed: string | null
  startAt: string
  endAt: string
  origin: 'manual' | 'redirect'
}

export function parseNumericId(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label} id: ${value}`)
  }

  return parsed
}

export function getLocalDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`)
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalDayBounds(dateKey: string): {
  startDate: Date
  endDate: Date
  startAt: string
  endAt: string
} {
  const [yearPart, monthPart, dayPart] = dateKey.split('-')
  const year = Number.parseInt(yearPart ?? '', 10)
  const month = Number.parseInt(monthPart ?? '', 10)
  const day = Number.parseInt(dayPart ?? '', 10)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid local date key: ${dateKey}`)
  }

  const startDate = new Date(year, month - 1, day, 0, 0, 0, 0)
  const endDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error(`Invalid local date key: ${dateKey}`)
  }

  return {
    startDate,
    endDate,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString()
  }
}

export function ensureIsoTimestamp(value: string, label: string): string {
  const normalizedInput =
    value.includes('T') || value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`
  const parsed = new Date(normalizedInput)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${value}`)
  }

  return parsed.toISOString()
}

export function assertSingleDayRange(startAt: string, endAt: string): void {
  if (getLocalDateKey(startAt) !== getLocalDateKey(endAt)) {
    throw new Error('Schedule blocks must stay within a single local day')
  }
}

export function buildGoalVersion(input: {
  taskTitle: string
  taskDescription: string | null
  goalSeed: string | null
  projectName: string | null
}): string {
  const hash = createHash('sha1')
    .update(
      JSON.stringify({
        taskTitle: input.taskTitle,
        taskDescription: input.taskDescription,
        goalSeed: input.goalSeed,
        projectName: input.projectName
      })
    )
    .digest('hex')

  return `planned-goal-${hash.slice(0, 16)}`
}

export function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    color: row.color,
    archived: row.archived === 1,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  }
}

export function mapScheduleBlockRow(row: ScheduleBlockRow): PlannedBlock {
  return {
    id: String(row.id),
    projectId: row.project_id === null ? null : String(row.project_id),
    projectName: row.project_name,
    projectColor: row.project_color,
    taskTitle: row.task_title,
    taskDescription: row.task_description,
    goalSeed: row.goal_seed,
    startAt: normalizeTimestamp(row.start_at),
    endAt: normalizeTimestamp(row.end_at),
    origin: row.origin,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  }
}

export function normalizeTimestamp(value: string): string {
  return ensureIsoTimestamp(value, 'timestamp')
}
