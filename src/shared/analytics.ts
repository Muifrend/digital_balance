export const ANALYTICS_GET_DAY_CHANNEL = 'analytics:getDay'
export const ANALYTICS_GET_WEEK_CHANNEL = 'analytics:getWeek'

export type DayTotals = {
  trackedMinutes: number
  onTaskMinutes: number
  offTaskMinutes: number
  untrackedMinutes: number
}

export type AppBreakdownEntry = {
  app: string
  totalMinutes: number
  onTaskMinutes: number
  offTaskMinutes: number
  untrackedMinutes: number
}

export type ProjectBreakdownEntry = {
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  totalMinutes: number
  onTaskMinutes: number
  offTaskMinutes: number
}

export type DaySummary = {
  date: string
  totals: DayTotals
  apps: AppBreakdownEntry[]
  projects: ProjectBreakdownEntry[]
}

export type WeekDayEntry = {
  date: string
  onTaskMinutes: number
  offTaskMinutes: number
  untrackedMinutes: number
}

export type WeekSummary = {
  endDate: string
  days: WeekDayEntry[]
}

export type AnalyticsApi = {
  getDay: (input: { date: string }) => Promise<DaySummary>
  getWeek: (input: { endDate: string }) => Promise<WeekSummary>
}
