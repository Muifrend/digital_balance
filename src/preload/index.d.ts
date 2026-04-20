import { ElectronAPI } from '@electron-toolkit/preload'
import type { AnalyticsApi } from '../shared/analytics'
import type { CalendarApi } from '../shared/calendar'
import type { CoachingApi } from '../shared/coaching'
import type { PipelineApi } from '../shared/pipeline'
import type { ProjectsApi } from '../shared/projects'
import type { SettingsApi } from '../shared/settings'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      pipeline: PipelineApi
      calendar: CalendarApi
      projects: ProjectsApi
      analytics: AnalyticsApi
      settings: SettingsApi
      coaching: CoachingApi
    }
  }
}
