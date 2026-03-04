/// <reference types="vite/client" />

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

interface RendererApi {
  getLatestActivityWatchEvent: () => Promise<ActivityWatchEvent | null>
  getGoals: () => Promise<string[]>
  setGoals: (goals: string[]) => Promise<string[]>
  onLatestActivityWatchEvent: (callback: (event: ActivityWatchEvent) => void) => () => void
}

interface Window {
  api: RendererApi
}
