import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  PIPELINE_GET_STATUS_CHANNEL,
  PIPELINE_STATUS_CHANNEL,
  type PipelineApi,
  type PipelineStatus
} from '../shared/pipeline'

const api: { pipeline: PipelineApi } = {
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
