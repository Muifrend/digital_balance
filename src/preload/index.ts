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

// Custom APIs for renderer
const api = {
  getLatestActivityWatchEvent: (): Promise<ActivityWatchEvent | null> =>
    ipcRenderer.invoke('activitywatch:get-latest-event'),
  getGoals: (): Promise<string[]> => ipcRenderer.invoke('goals:get'),
  setGoals: (goals: string[]): Promise<string[]> => ipcRenderer.invoke('goals:set', goals),
  onLatestActivityWatchEvent: (callback: (event: ActivityWatchEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: ActivityWatchEvent) => {
      callback(event)
    }

    ipcRenderer.on('activitywatch:latest-event', listener)
    return () => {
      ipcRenderer.removeListener('activitywatch:latest-event', listener)
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
