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

interface RendererApi {
  getLatestActivityWatchEvent: () => Promise<ActivityWatchEvent | null>
  getLatestClassification: () => Promise<ClassificationResult | null>
  getClassificationHistory: () => Promise<ClassificationHistoryEntry[]>
  clearClassificationHistory: () => Promise<void>
  getGoals: () => Promise<string[]>
  setGoals: (goals: string[]) => Promise<string[]>
  onLatestActivityWatchEvent: (callback: (event: ActivityWatchEvent) => void) => () => void
  onLatestClassification: (callback: (result: ClassificationResult) => void) => () => void
}

interface Window {
  api: RendererApi
}
