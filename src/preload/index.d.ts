import { ElectronAPI } from '@electron-toolkit/preload'
import type { PipelineApi } from '../shared/pipeline'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      pipeline: PipelineApi
    }
  }
}
