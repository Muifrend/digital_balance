import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  CALENDAR_CHANGED_CHANNEL,
  CALENDAR_CONFIRM_ON_TASK_CHANNEL,
  CALENDAR_CREATE_BLOCK_CHANNEL,
  CALENDAR_DELETE_BLOCK_CHANNEL,
  CALENDAR_GET_DAY_CHANNEL,
  CALENDAR_GET_EVIDENCE_CHANNEL,
  CALENDAR_REDIRECT_BLOCK_CHANNEL,
  CALENDAR_UPDATE_BLOCK_CHANNEL,
  type CalendarApi
} from '../shared/calendar'
import {
  COACHING_CONFIRM_CHANNEL,
  COACHING_DISMISS_CHANNEL,
  COACHING_GET_ACTIVE_CHANNEL,
  COACHING_REDIRECT_CHANNEL,
  COACHING_STATUS_CHANNEL,
  type CoachingApi,
  type CoachingPrompt
} from '../shared/coaching'
import {
  PIPELINE_GET_STATUS_CHANNEL,
  PIPELINE_STATUS_CHANNEL,
  type PipelineApi,
  type PipelineStatus
} from '../shared/pipeline'
import {
  PROJECTS_ARCHIVE_CHANNEL,
  PROJECTS_CREATE_CHANNEL,
  PROJECTS_LIST_CHANNEL,
  PROJECTS_UPDATE_CHANNEL,
  type ProjectsApi
} from '../shared/projects'
import {
  ANALYTICS_GET_DAY_CHANNEL,
  ANALYTICS_GET_WEEK_CHANNEL,
  type AnalyticsApi
} from '../shared/analytics'

const api: {
  pipeline: PipelineApi
  calendar: CalendarApi
  projects: ProjectsApi
  analytics: AnalyticsApi
  coaching: CoachingApi
} = {
  pipeline: {
    getStatus: (): Promise<PipelineStatus> => ipcRenderer.invoke(PIPELINE_GET_STATUS_CHANNEL),
    onStatus: (listener) => {
      const handleStatus = (_event: IpcRendererEvent, status: PipelineStatus): void => {
        listener(status)
      }

      ipcRenderer.on(PIPELINE_STATUS_CHANNEL, handleStatus)

      return () => {
        ipcRenderer.removeListener(PIPELINE_STATUS_CHANNEL, handleStatus)
      }
    }
  },
  calendar: {
    getDay: (input) => ipcRenderer.invoke(CALENDAR_GET_DAY_CHANNEL, input),
    getEvidence: (input) => ipcRenderer.invoke(CALENDAR_GET_EVIDENCE_CHANNEL, input),
    createBlock: (input) => ipcRenderer.invoke(CALENDAR_CREATE_BLOCK_CHANNEL, input),
    updateBlock: (input) => ipcRenderer.invoke(CALENDAR_UPDATE_BLOCK_CHANNEL, input),
    deleteBlock: (input) => ipcRenderer.invoke(CALENDAR_DELETE_BLOCK_CHANNEL, input),
    redirectBlock: (input) => ipcRenderer.invoke(CALENDAR_REDIRECT_BLOCK_CHANNEL, input),
    confirmOnTask: (input) => ipcRenderer.invoke(CALENDAR_CONFIRM_ON_TASK_CHANNEL, input),
    onChanged: (listener) => {
      const handleChanged = (_event: IpcRendererEvent, date: string): void => {
        listener(date)
      }

      ipcRenderer.on(CALENDAR_CHANGED_CHANNEL, handleChanged)

      return () => {
        ipcRenderer.removeListener(CALENDAR_CHANGED_CHANNEL, handleChanged)
      }
    }
  },
  projects: {
    list: () => ipcRenderer.invoke(PROJECTS_LIST_CHANNEL),
    create: (input) => ipcRenderer.invoke(PROJECTS_CREATE_CHANNEL, input),
    update: (input) => ipcRenderer.invoke(PROJECTS_UPDATE_CHANNEL, input),
    archive: (input) => ipcRenderer.invoke(PROJECTS_ARCHIVE_CHANNEL, input)
  },
  analytics: {
    getDay: (input) => ipcRenderer.invoke(ANALYTICS_GET_DAY_CHANNEL, input),
    getWeek: (input) => ipcRenderer.invoke(ANALYTICS_GET_WEEK_CHANNEL, input)
  },
  coaching: {
    getActive: (): Promise<CoachingPrompt | null> =>
      ipcRenderer.invoke(COACHING_GET_ACTIVE_CHANNEL),
    onPrompt: (listener) => {
      const handlePrompt = (_event: IpcRendererEvent, prompt: CoachingPrompt | null): void => {
        listener(prompt)
      }

      ipcRenderer.on(COACHING_STATUS_CHANNEL, handlePrompt)

      return () => {
        ipcRenderer.removeListener(COACHING_STATUS_CHANNEL, handlePrompt)
      }
    },
    confirm: (input) => ipcRenderer.invoke(COACHING_CONFIRM_CHANNEL, input),
    dismiss: (input) => ipcRenderer.invoke(COACHING_DISMISS_CHANNEL, input),
    redirect: (input) => ipcRenderer.invoke(COACHING_REDIRECT_CHANNEL, input)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
