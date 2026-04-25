import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createActivityWatchService } from './activitywatch/service'
import { createCoachingService, type CoachingService } from './coaching/service'
import { createDatabaseService, type DatabaseService } from './db/service'
import { createPipelineService, type PipelineService } from './pipeline/service'
import {
  CALENDAR_CHANGED_CHANNEL,
  CALENDAR_CONFIRM_ON_TASK_CHANNEL,
  CALENDAR_CREATE_BLOCK_CHANNEL,
  CALENDAR_DELETE_BLOCK_CHANNEL,
  CALENDAR_GET_DAY_CHANNEL,
  CALENDAR_GET_EVIDENCE_CHANNEL,
  CALENDAR_REDIRECT_BLOCK_CHANNEL,
  CALENDAR_UPDATE_BLOCK_CHANNEL
} from '../shared/calendar'
import {
  COACHING_CONFIRM_CHANNEL,
  COACHING_DISMISS_CHANNEL,
  COACHING_GET_ACTIVE_CHANNEL,
  COACHING_REDIRECT_CHANNEL,
  COACHING_STATUS_CHANNEL,
  type CoachingPrompt
} from '../shared/coaching'
import {
  PIPELINE_GET_STATUS_CHANNEL,
  PIPELINE_STATUS_CHANNEL,
  createInitialPipelineStatus,
  type PipelineStatus
} from '../shared/pipeline'
import {
  PROJECTS_ARCHIVE_CHANNEL,
  PROJECTS_CREATE_CHANNEL,
  PROJECTS_CRITIQUE_DESCRIPTION_CHANNEL,
  PROJECTS_LIST_CHANNEL,
  PROJECTS_UPDATE_CHANNEL
} from '../shared/projects'
import { requestProjectDescriptionCritique } from './project-critique'
import {
  ANALYTICS_GET_DAY_CHANNEL,
  ANALYTICS_GET_WEEK_CHANNEL
} from '../shared/analytics'
import {
  SETTINGS_GET_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
  maskApiKey,
  type AppSettings,
  type SettingsSummary
} from '../shared/settings'
import { createSettingsStore, type SettingsStore } from './settings/store'
import icon from '../../resources/icon.png?asset'

let databaseService: DatabaseService | null = null
let pipelineService: PipelineService | null = null
let coachingService: CoachingService | null = null
let settingsStore: SettingsStore | null = null

function summarizeSettings(settings: AppSettings): SettingsSummary {
  return {
    hasOpenAiApiKey: Boolean(settings.openAiApiKey),
    openAiApiKeyMasked: maskApiKey(settings.openAiApiKey)
  }
}

function resolveProjectRoot(): string {
  const candidates = [process.cwd(), app.getAppPath(), join(__dirname, '../..')]
  return candidates.find((candidate) => existsSync(join(candidate, '.env'))) ?? candidates[0]
}

function getPipelineStatusSnapshot(): PipelineStatus {
  return pipelineService?.getStatusSnapshot() ?? createInitialPipelineStatus()
}

function broadcastPipelineStatus(status: PipelineStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(PIPELINE_STATUS_CHANNEL, status)
    }
  }
}

function broadcastCalendarChanged(date: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(CALENDAR_CHANGED_CHANNEL, date)
    }
  }
}

function broadcastCoachingPrompt(prompt: CoachingPrompt | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(COACHING_STATUS_CHANNEL, prompt)
    }
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.canopy.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle(PIPELINE_GET_STATUS_CHANNEL, () => getPipelineStatusSnapshot())
  ipcMain.handle(PROJECTS_LIST_CHANNEL, () => databaseService?.listProjects() ?? [])
  ipcMain.handle(PROJECTS_CREATE_CHANNEL, (_event, input) => databaseService?.createProject(input))
  ipcMain.handle(PROJECTS_UPDATE_CHANNEL, (_event, input) => databaseService?.updateProject(input))
  ipcMain.handle(PROJECTS_ARCHIVE_CHANNEL, (_event, input) =>
    databaseService?.archiveProject(input)
  )
  ipcMain.handle(
    PROJECTS_CRITIQUE_DESCRIPTION_CHANNEL,
    async (_event, input: { name: string; description: string }) => {
      const apiKey = databaseService?.getOpenAiApiKey() ?? null
      if (!apiKey) {
        throw new Error(
          'No OpenAI API key configured. Add one in Settings to get AI feedback on descriptions.'
        )
      }

      const name = typeof input?.name === 'string' ? input.name.trim() : ''
      const description = typeof input?.description === 'string' ? input.description.trim() : ''
      if (!name) throw new Error('Project name is required.')
      if (!description) throw new Error('Description is required.')

      return requestProjectDescriptionCritique({ apiKey, name, description })
    }
  )
  ipcMain.handle(CALENDAR_GET_DAY_CHANNEL, (_event, input) =>
    databaseService?.getDayViewData(input)
  )
  ipcMain.handle(CALENDAR_GET_EVIDENCE_CHANNEL, (_event, input) =>
    databaseService?.getActivityEvidence(input)
  )
  ipcMain.handle(CALENDAR_CREATE_BLOCK_CHANNEL, (_event, input) =>
    databaseService?.createScheduleBlock(input)
  )
  ipcMain.handle(CALENDAR_UPDATE_BLOCK_CHANNEL, (_event, input) =>
    databaseService?.updateScheduleBlock(input)
  )
  ipcMain.handle(CALENDAR_DELETE_BLOCK_CHANNEL, (_event, input) =>
    databaseService?.deleteScheduleBlock(input)
  )
  ipcMain.handle(CALENDAR_REDIRECT_BLOCK_CHANNEL, (_event, input) =>
    databaseService?.redirectScheduleBlock(input)
  )
  ipcMain.handle(CALENDAR_CONFIRM_ON_TASK_CHANNEL, (_event, input) =>
    databaseService?.confirmOnTask(input)
  )
  ipcMain.handle(ANALYTICS_GET_DAY_CHANNEL, (_event, input) =>
    databaseService?.getAnalyticsDay(input)
  )
  ipcMain.handle(ANALYTICS_GET_WEEK_CHANNEL, (_event, input) =>
    databaseService?.getAnalyticsWeek(input)
  )
  ipcMain.handle(SETTINGS_GET_CHANNEL, (): SettingsSummary => {
    const settings = settingsStore?.read() ?? { openAiApiKey: null }
    return summarizeSettings(settings)
  })
  ipcMain.handle(
    SETTINGS_UPDATE_CHANNEL,
    (_event, input: { openAiApiKey: string | null }): SettingsSummary => {
      if (!settingsStore) {
        throw new Error('Settings store not initialized')
      }

      const normalizedKey =
        typeof input?.openAiApiKey === 'string' && input.openAiApiKey.trim().length > 0
          ? input.openAiApiKey.trim()
          : null
      const saved = settingsStore.write({ openAiApiKey: normalizedKey })
      databaseService?.setOpenAiApiKey(saved.openAiApiKey)
      return summarizeSettings(saved)
    }
  )
  ipcMain.handle(COACHING_GET_ACTIVE_CHANNEL, () => coachingService?.getActivePrompt() ?? null)
  ipcMain.handle(COACHING_CONFIRM_CHANNEL, (_event, input) =>
    coachingService?.confirmPrompt(input.promptId)
  )
  ipcMain.handle(COACHING_DISMISS_CHANNEL, (_event, input) =>
    coachingService?.dismissPrompt(input.promptId)
  )
  ipcMain.handle(COACHING_REDIRECT_CHANNEL, (_event, input) =>
    coachingService?.redirectPrompt(input)
  )

  settingsStore = createSettingsStore(app.getPath('userData'))

  databaseService = createDatabaseService({
    databasePath: join(app.getPath('userData'), 'digital_balance.db'),
    projectRoot: resolveProjectRoot()
  })
  databaseService.initialize()
  const databaseInitializationError = databaseService.getInitializationError()
  if (databaseInitializationError) {
    dialog.showErrorBox(
      'Canopy failed to initialize its local database',
      `${databaseInitializationError}\n\nCanopy will open with limited functionality so you can inspect Settings or retry with a new build.`
    )
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    return
  }

  const storedSettings = settingsStore.read()
  if (storedSettings.openAiApiKey) {
    databaseService.setOpenAiApiKey(storedSettings.openAiApiKey)
  }

  void databaseService.startClassificationWorker()
  databaseService.onCalendarChange((date) => {
    broadcastCalendarChanged(date)
  })

  const activityWatchService = createActivityWatchService()
  pipelineService = createPipelineService({
    database: databaseService,
    activityWatch: activityWatchService,
    onStatusChange: (status) => {
      broadcastPipelineStatus(status)
    }
  })
  void pipelineService.start()

  coachingService = createCoachingService({
    database: databaseService
  })
  coachingService.onPromptChange((prompt) => {
    broadcastCoachingPrompt(prompt)
  })
  coachingService.start()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  coachingService?.stop()
  pipelineService?.stop()
  databaseService?.close()
})
