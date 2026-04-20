import type {
  AppBreakdownEntry,
  DaySummary,
  DayTotals,
  ProjectBreakdownEntry,
  WeekDayEntry,
  WeekSummary
} from '../../shared/analytics'
import type { DatabaseContext } from './context'
import { getLocalDayBounds } from './utils'

export type AnalyticsDatabase = {
  getDaySummary: (input: { date: string }) => DaySummary
  getWeekSummary: (input: { endDate: string }) => WeekSummary
}

type DayTotalsRow = {
  tracked_minutes: number
  on_task_minutes: number
  off_task_minutes: number
}

type AppRow = {
  app: string
  total_minutes: number
  on_task_minutes: number
  off_task_minutes: number
}

type ProjectRow = {
  project_id: number | null
  project_name: string | null
  project_color: string | null
  total_minutes: number
  on_task_minutes: number
}

/**
 * Correlated subquery that matches `choosePreferredClassifications()`
 * in day-view.ts: for each minute, prefer corrected=1, then latest
 * created_at, then highest id. Reused across multiple aggregates.
 */
const PREFERRED_CLASSIFICATION_JOIN = `
  LEFT JOIN classifications c ON c.id = (
    SELECT id FROM classifications c2
    WHERE c2.minute_timestamp = mi.minute_timestamp
    ORDER BY c2.corrected DESC, c2.created_at DESC, c2.id DESC
    LIMIT 1
  )
`

function shiftDayKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d + deltaDays)
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0')
  ].join('-')
}

export function createAnalyticsDatabase(context: DatabaseContext): AnalyticsDatabase {
  if (!context.database) {
    throw new Error('Database not initialized')
  }

  const totalsStatement = context.database.prepare(`
    SELECT
      COUNT(*) AS tracked_minutes,
      SUM(CASE WHEN c.on_task = 1 THEN 1 ELSE 0 END) AS on_task_minutes,
      SUM(CASE WHEN c.on_task = 0 THEN 1 ELSE 0 END) AS off_task_minutes
    FROM minute_ingest mi
    ${PREFERRED_CLASSIFICATION_JOIN}
    WHERE mi.minute_timestamp >= ?
      AND mi.minute_timestamp < ?
      AND mi.summary_status = 'winner'
      AND mi.winning_app IS NOT NULL
      AND mi.afk = 0
  `)

  const appsStatement = context.database.prepare(`
    SELECT
      mi.winning_app AS app,
      COUNT(*) AS total_minutes,
      SUM(CASE WHEN c.on_task = 1 THEN 1 ELSE 0 END) AS on_task_minutes,
      SUM(CASE WHEN c.on_task = 0 THEN 1 ELSE 0 END) AS off_task_minutes
    FROM minute_ingest mi
    ${PREFERRED_CLASSIFICATION_JOIN}
    WHERE mi.minute_timestamp >= ?
      AND mi.minute_timestamp < ?
      AND mi.summary_status = 'winner'
      AND mi.winning_app IS NOT NULL
      AND mi.afk = 0
    GROUP BY mi.winning_app
    ORDER BY total_minutes DESC, mi.winning_app ASC
  `)

  const projectsStatement = context.database.prepare(`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      p.color AS project_color,
      COUNT(c.id) AS total_minutes,
      SUM(CASE WHEN c.on_task = 1 THEN 1 ELSE 0 END) AS on_task_minutes
    FROM classifications c
    JOIN schedule_blocks sb ON sb.id = c.planned_block_id
    LEFT JOIN projects p ON p.id = sb.project_id
    WHERE c.minute_timestamp >= ?
      AND c.minute_timestamp < ?
      AND c.id = (
        SELECT id FROM classifications c2
        WHERE c2.minute_timestamp = c.minute_timestamp
        ORDER BY c2.corrected DESC, c2.created_at DESC, c2.id DESC
        LIMIT 1
      )
    GROUP BY p.id, p.name, p.color
    ORDER BY total_minutes DESC, p.name ASC
  `)

  function getDayTotals(startAt: string, endAt: string): DayTotals {
    const row = totalsStatement.get(startAt, endAt) as DayTotalsRow | undefined
    const tracked = row?.tracked_minutes ?? 0
    const onTask = row?.on_task_minutes ?? 0
    const offTask = row?.off_task_minutes ?? 0
    return {
      trackedMinutes: tracked,
      onTaskMinutes: onTask,
      offTaskMinutes: offTask,
      untrackedMinutes: Math.max(0, tracked - onTask - offTask)
    }
  }

  function getDayApps(startAt: string, endAt: string): AppBreakdownEntry[] {
    const rows = appsStatement.all(startAt, endAt) as AppRow[]
    return rows.map((row) => {
      const total = row.total_minutes ?? 0
      const onTask = row.on_task_minutes ?? 0
      const offTask = row.off_task_minutes ?? 0
      return {
        app: row.app,
        totalMinutes: total,
        onTaskMinutes: onTask,
        offTaskMinutes: offTask,
        untrackedMinutes: Math.max(0, total - onTask - offTask)
      }
    })
  }

  function getDayProjects(startAt: string, endAt: string): ProjectBreakdownEntry[] {
    const rows = projectsStatement.all(startAt, endAt) as ProjectRow[]
    return rows.map((row) => {
      const total = row.total_minutes ?? 0
      const onTask = row.on_task_minutes ?? 0
      return {
        projectId: row.project_id === null ? null : String(row.project_id),
        projectName: row.project_name,
        projectColor: row.project_color,
        totalMinutes: total,
        onTaskMinutes: onTask,
        offTaskMinutes: Math.max(0, total - onTask)
      }
    })
  }

  function getDaySummary(input: { date: string }): DaySummary {
    const bounds = getLocalDayBounds(input.date)
    return {
      date: input.date,
      totals: getDayTotals(bounds.startAt, bounds.endAt),
      apps: getDayApps(bounds.startAt, bounds.endAt),
      projects: getDayProjects(bounds.startAt, bounds.endAt)
    }
  }

  function getWeekSummary(input: { endDate: string }): WeekSummary {
    const days: WeekDayEntry[] = []
    for (let i = 6; i >= 0; i--) {
      const dateKey = shiftDayKey(input.endDate, -i)
      const bounds = getLocalDayBounds(dateKey)
      const totals = getDayTotals(bounds.startAt, bounds.endAt)
      days.push({
        date: dateKey,
        onTaskMinutes: totals.onTaskMinutes,
        offTaskMinutes: totals.offTaskMinutes,
        untrackedMinutes: totals.untrackedMinutes
      })
    }
    return { endDate: input.endDate, days }
  }

  return {
    getDaySummary,
    getWeekSummary
  }
}
