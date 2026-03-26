import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const OPENAI_MODEL = 'gpt-4o-mini'
export const PROMPT_VERSION = 'on-task-v1'
export const CLASSIFIER_VERSION = 'openai-on-task-v1'

export const ACTIVE_GOAL = {
  version: 'placeholder-goal-v1',
  title: 'Build the digital balance app',
  description: 'Working on Electron, TypeScript, ActivityWatch integration and SQLite persistence'
} as const

export type ClassificationRequestInput = {
  app: string
  title: string | null
  dominance: number | null
  afk: boolean
}

export type ParsedClassificationResponse = {
  onTask: boolean
  confidence: number
  reasoning: string | null
}

type OpenAiChatCompletionRequestBody = {
  model: string
  max_tokens: number
  temperature: number
  messages: Array<{
    role: 'system' | 'user'
    content: string
  }>
}

type ParsedResponseCandidate = {
  on_task?: unknown
  confidence?: unknown
  reasoning?: unknown
}

export function loadOpenAiApiKey(projectRoot: string): string | null {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) {
    return null
  }

  try {
    const envContents = readFileSync(envPath, 'utf8')
    const apiKeyLine = envContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('OPENAI_API_KEY='))

    if (!apiKeyLine) {
      return null
    }

    const rawValue = apiKeyLine.slice('OPENAI_API_KEY='.length).trim()
    const normalizedValue =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue

    return normalizedValue.length > 0 ? normalizedValue : null
  } catch {
    return null
  }
}

export function buildClassificationRequest(input: ClassificationRequestInput): {
  systemPrompt: string
  userPrompt: string
  body: OpenAiChatCompletionRequestBody
} {
  const systemPrompt =
    "You are a productivity classifier. Given a computer activity record and the user's current goal, respond with JSON only. No markdown, no explanation, just raw JSON."

  const userPrompt = `Classify this minute of computer activity.

Activity:
- App: ${input.app}
- Window title: ${input.title ?? 'null'}
- Dominance: ${input.dominance ?? 'null'} (fraction of the minute on this app)
- AFK: ${input.afk} (user had no keyboard/mouse input)

Current goal: ${ACTIVE_GOAL.title}
Goal description: ${ACTIVE_GOAL.description}

Respond with exactly this JSON shape:
{
  "on_task": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "one sentence explanation"
}`

  return {
    systemPrompt,
    userPrompt,
    body: {
      model: OPENAI_MODEL,
      max_tokens: 100,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    }
  }
}

function parseClassificationCandidate(
  candidate: ParsedResponseCandidate
): ParsedClassificationResponse | null {
  if (typeof candidate.on_task !== 'boolean' || typeof candidate.confidence !== 'number') {
    return null
  }

  if (!Number.isFinite(candidate.confidence)) {
    return null
  }

  const reasoning =
    typeof candidate.reasoning === 'string'
      ? candidate.reasoning.trim() || null
      : candidate.reasoning == null
        ? null
        : null

  return {
    onTask: candidate.on_task,
    confidence: Math.max(0, Math.min(candidate.confidence, 1)),
    reasoning
  }
}

function stripSingleCodeFence(content: string): string {
  const trimmedContent = content.trim()
  const codeFenceMatch = trimmedContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return codeFenceMatch?.[1]?.trim() ?? trimmedContent
}

export function parseClassificationResponse(content: string): ParsedClassificationResponse | null {
  const attempts = [content, stripSingleCodeFence(content)]

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as ParsedResponseCandidate
      const normalized = parseClassificationCandidate(parsed)
      if (normalized) {
        return normalized
      }
    } catch {
      continue
    }
  }

  return null
}

export function getClassificationRetryDelayMs(attemptCount: number): number {
  if (attemptCount <= 1) {
    return 60_000
  }

  if (attemptCount === 2) {
    return 5 * 60_000
  }

  if (attemptCount === 3) {
    return 15 * 60_000
  }

  return 60 * 60_000
}
