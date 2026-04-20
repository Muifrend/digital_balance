import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { AppSettings } from '../../shared/settings'

const DEFAULT_SETTINGS: AppSettings = {
  openAiApiKey: null
}

function normalize(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const candidate = raw as { openAiApiKey?: unknown }
  const openAiApiKey =
    typeof candidate.openAiApiKey === 'string' && candidate.openAiApiKey.trim().length > 0
      ? candidate.openAiApiKey.trim()
      : null
  return { openAiApiKey }
}

export type SettingsStore = {
  read: () => AppSettings
  write: (settings: AppSettings) => AppSettings
}

export function createSettingsStore(userDataPath: string): SettingsStore {
  const filePath = join(userDataPath, 'settings.json')

  function read(): AppSettings {
    if (!existsSync(filePath)) return { ...DEFAULT_SETTINGS }
    try {
      const contents = readFileSync(filePath, 'utf8')
      return normalize(JSON.parse(contents))
    } catch (error) {
      console.warn('[settings] Failed to read settings.json, falling back to defaults:', error)
      return { ...DEFAULT_SETTINGS }
    }
  }

  function write(settings: AppSettings): AppSettings {
    const normalized = normalize(settings)
    const dir = dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tempPath = `${filePath}.tmp`
    writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf8')
    renameSync(tempPath, filePath)
    return normalized
  }

  return { read, write }
}
