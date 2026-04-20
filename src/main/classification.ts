import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export const OPENAI_MODEL = 'gpt-4o-mini'
export const PROMPT_VERSION = 'on-task-v2'
export const CLASSIFIER_VERSION = 'openai-on-task-v1'

export type ClassificationRequestInput = {
  app: string
  title: string | null
  dominance: number | null
  afk: boolean
  goalTitle: string
  goalDescription: string | null
  goalSeed: string | null
  projectName: string | null
  projectDescription: string | null
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
  const systemPrompt = `You are a productivity classifier. Given an activity record and the user's current project and task, decide whether the activity is plausibly in service of the goal.

Guidelines:
- Reading code, browsing docs, using terminals, searching the web, consulting AI assistants, and reviewing output all count as on-task when the project is work of that kind (coding, writing, research, etc.). Do not require active typing — a minute of reading is still on-task.
- Only mark off-task when the app or window title is clearly unrelated to the project (e.g. social media, unrelated video content, games, personal browsing).
- If the activity could plausibly support the project, prefer on-task with moderate confidence rather than off-task.
- Confidence reflects how clearly the activity matches or mismatches the goal, not how actively the user is working.

Respond with JSON only. No markdown, no explanation, just raw JSON.`

  const userPrompt = `Classify this minute of computer activity.

Activity:
- App: ${input.app}
- Window title: ${input.title ?? 'null'}
- Dominance: ${input.dominance ?? 'null'} (fraction of the minute on this app)
- AFK: ${input.afk} (user had no keyboard/mouse input)

Current goal: ${input.goalTitle}
Goal description: ${input.goalDescription ?? 'null'}
Goal seed: ${input.goalSeed ?? 'null'}
Project name: ${input.projectName ?? 'null'}
Project description: ${input.projectDescription ?? 'null'}

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
