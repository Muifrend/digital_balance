export interface ActivityEvent {
  id: number
  timestamp: string
  app: string
  title: string
  duration: number
}

export interface ClassificationEntry {
  timestamp: string
  app: string
  title: string
  onGoal: boolean
  confidence: number
  reasoning: string
}
