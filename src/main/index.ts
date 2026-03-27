import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createActivityWatchService } from './activitywatch/service'
import { createDatabaseService, type DatabaseService } from './db/service'
import { createPipelineService, type PipelineService } from './pipeline/service'
import {
  PIPELINE_GET_STATUS_CHANNEL,
  PIPELINE_STATUS_CHANNEL,
  createInitialPipelineStatus,
  type PipelineStatus
} from '../shared/pipeline'
import icon from '../../resources/icon.png?asset'

let databaseService: DatabaseService | null = null
let pipelineService: PipelineService | null = null

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
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))
  ipcMain.handle(PIPELINE_GET_STATUS_CHANNEL, () => getPipelineStatusSnapshot())

  databaseService = createDatabaseService({
    databasePath: join(app.getPath('userData'), 'digital_balance.db'),
    projectRoot: resolveProjectRoot()
  })
  databaseService.initialize()
  void databaseService.startClassificationWorker()

  const activityWatchService = createActivityWatchService()
  pipelineService = createPipelineService({
    database: databaseService,
    activityWatch: activityWatchService,
    onStatusChange: (status) => {
      broadcastPipelineStatus(status)
    }
  })
  void pipelineService.start()

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
  pipelineService?.stop()
  databaseService?.close()
})
