import type { ProjectDescriptionCritique } from '../shared/projects'
import { OPENAI_MODEL } from './classification'

type OpenAiResponseChoice = {
  message?: { content?: unknown }
}

type OpenAiResponseBody = {
  choices?: OpenAiResponseChoice[]
}

const SYSTEM_PROMPT = `You review project descriptions that a user writes for a personal productivity app. The descriptions are later handed to an AI that classifies whether the user's activity matches the project.

Your job is to judge whether the description gives enough context for an automated classifier to recognize on-task work. A good description typically mentions: what the project IS, what the user is building or producing, the user's role or goal, and concrete examples of work that would count (tools, topics, deliverables).

Respond with raw JSON only — no markdown, no prose outside the JSON.

Shape:
{
  "verdict": "sufficient" | "needs_detail",
  "feedback": "one or two sentences"
}

Choose "sufficient" when the description clearly communicates the project and what success looks like. Choose "needs_detail" when it is vague, overly short, or would leave an automated reviewer guessing.

When feedback is "needs_detail", be specific and constructive — name what is missing (e.g. "mention the tech stack", "explain who the audience is", "describe what finishing looks like"). When "sufficient", briefly affirm what makes it work so the user knows to keep that level of detail next time.`

type CritiqueCandidate = {
  verdict?: unknown
  feedback?: unknown
}

function parseCritiqueContent(content: string): ProjectDescriptionCritique | null {
  let candidate: CritiqueCandidate
  try {
    candidate = JSON.parse(content) as CritiqueCandidate
  } catch {
    return null
  }

  const verdict = candidate.verdict === 'sufficient' ? 'sufficient' : 'needs_detail'
  const feedback =
    typeof candidate.feedback === 'string' && candidate.feedback.trim().length > 0
      ? candidate.feedback.trim()
      : null

  if (!feedback) return null
  return { verdict, feedback }
}

export async function requestProjectDescriptionCritique(input: {
  apiKey: string
  name: string
  description: string
}): Promise<ProjectDescriptionCritique> {
  const userPrompt = `Project name: ${input.name}

Project description:
"""
${input.description}
"""

Assess whether this description is detailed enough for an automated on-task classifier.`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 200,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    })
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${text.slice(0, 300) || 'empty response body'}`)
  }

  let parsed: OpenAiResponseBody
  try {
    parsed = JSON.parse(text) as OpenAiResponseBody
  } catch {
    throw new Error('OpenAI returned invalid JSON')
  }

  const content = parsed.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI returned no content')
  }

  const critique = parseCritiqueContent(content)
  if (!critique) {
    throw new Error('OpenAI returned an unparseable critique')
  }

  return critique
}
