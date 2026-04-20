export const SETTINGS_GET_CHANNEL = 'settings:get'
export const SETTINGS_UPDATE_CHANNEL = 'settings:update'

export type AppSettings = {
  openAiApiKey: string | null
}

export type SettingsSummary = {
  hasOpenAiApiKey: boolean
  openAiApiKeyMasked: string | null
}

export type SettingsApi = {
  get: () => Promise<SettingsSummary>
  update: (input: { openAiApiKey: string | null }) => Promise<SettingsSummary>
}

export function maskApiKey(key: string | null): string | null {
  if (!key) return null
  const trimmed = key.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length <= 8) return '•'.repeat(trimmed.length)
  return `${trimmed.slice(0, 4)}${'•'.repeat(Math.max(4, trimmed.length - 8))}${trimmed.slice(-4)}`
}
