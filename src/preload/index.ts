import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

interface ActivityWatchEventData {
  app?: string
  title?: string
  [key: string]: unknown
}

interface ActivityWatchEvent {
  timestamp: string
  duration: number
  data: ActivityWatchEventData
  [key: string]: unknown
}

interface ClassificationResult {
  onGoal: boolean
  confidence: number
  reasoning: string
}

interface ClassificationHistoryEntry {
  timestamp: string
  app: string
  title: string
  onGoal: boolean
  confidence: number
  reasoning: string
}

// Custom APIs for renderer
const api = {
  getLatestActivityWatchEvent: (): Promise<ActivityWatchEvent | null> =>
    ipcRenderer.invoke('activitywatch:get-latest-event'),
  getLatestClassification: (): Promise<ClassificationResult | null> =>
    ipcRenderer.invoke('classification:get-latest'),
  getClassificationHistory: (): Promise<ClassificationHistoryEntry[]> =>
    ipcRenderer.invoke('classification:get-history'),
  clearClassificationHistory: (): Promise<void> => ipcRenderer.invoke('classification:clear-history'),
  getGoals: (): Promise<string[]> => ipcRenderer.invoke('goals:get'),
  setGoals: (goals: string[]): Promise<string[]> => ipcRenderer.invoke('goals:set', goals),
  onLatestActivityWatchEvent: (callback: (event: ActivityWatchEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: ActivityWatchEvent): void => {
      callback(event)
    }

    ipcRenderer.on('activitywatch:latest-event', listener)
    return () => {
      ipcRenderer.removeListener('activitywatch:latest-event', listener)
    }
  },
  onLatestClassification: (callback: (result: ClassificationResult) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, result: ClassificationResult): void => {
      callback(result)
    }

    ipcRenderer.on('classification:latest', listener)
    return () => {
      ipcRenderer.removeListener('classification:latest', listener)
    }
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
