import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron'
import { Buffer } from 'node:buffer'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { ApprovalCoordinator, ProviderCredentialResolver } from '../../../../packages/core/src'
import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { BuiltInActionExecutor, OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import {
  appSettingsSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  getProviderDefinition,
  providerCredentialInputSchema,
  providerStatusSchema,
  resolveApprovalInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  saveProviderApiKeyInputSchema,
  startRunResultSchema,
  type AppSettings,
} from '../../../../packages/shared/src'

app.setName('Nano Harness')

const SAFE_STORAGE_PREFIX = 'safe-storage:v1:'
const ACTIVE_RUN_STATUSES = ['created', 'started', 'waiting_approval'] as const

function getAppIconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png')
}

function buildApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Nano Harness',
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'File',
      submenu: [{ role: 'close' }],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ])
}

function getBackupFileName(date = new Date()): string {
  return `nano-harness-backup-${date.toISOString().slice(0, 10)}.db`
}

function getTimestampedBackupFileName(date = new Date()): string {
  return `nano-harness-safety-backup-${date.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.db`
}

type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  eventBus: InMemoryEventBus
  approvalCoordinator: DesktopApprovalCoordinator
}

function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure API key storage is not available on this system.')
  }

  return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(apiKey).toString('base64')}`
}

function decryptApiKey(encryptedApiKey: string): string {
  if (!encryptedApiKey.startsWith(SAFE_STORAGE_PREFIX)) {
    throw new Error('Stored API key uses an unsupported secure storage format.')
  }

  return safeStorage.decryptString(Buffer.from(encryptedApiKey.slice(SAFE_STORAGE_PREFIX.length), 'base64'))
}

class DesktopApprovalCoordinator implements ApprovalCoordinator {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (resolution: { approvalRequestId: string; decision: 'granted' | 'rejected'; decidedAt: string }) => void
    }
  >()

  async waitForDecision(input: Parameters<ApprovalCoordinator['waitForDecision']>[0]) {
    return await new Promise<{ approvalRequestId: string; decision: 'granted' | 'rejected'; decidedAt: string }>(
      (resolve, reject) => {
        const onAbort = () => {
          this.pendingRequests.delete(input.request.id)
          const error = new Error('Approval wait aborted')
          error.name = 'AbortError'
          reject(error)
        }

        if (input.signal.aborted) {
          onAbort()
          return
        }

        this.pendingRequests.set(input.request.id, {
          resolve: (resolution) => {
            input.signal.removeEventListener('abort', onAbort)
            this.pendingRequests.delete(input.request.id)
            resolve(resolution)
          },
        })

        input.signal.addEventListener('abort', onAbort, { once: true })
      },
    )
  }

  async resolveDecision(input: { approvalRequestId: string; decision: 'granted' | 'rejected' }): Promise<boolean> {
    const pendingRequest = this.pendingRequests.get(input.approvalRequestId)

    if (!pendingRequest) {
      return false
    }

    pendingRequest.resolve({
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      decidedAt: new Date().toISOString(),
    })

    return true
  }
}

function buildDefaultSettings(): AppSettings {
  const provider = getProviderDefinition('openrouter')

  return {
    provider: {
      provider: provider.key,
      model: provider.defaultModel,
    },
    workspace: {
      rootPath: join(app.getPath('home'), 'nano-harness'),
      approvalPolicy: 'on-request',
    },
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: 'Nano Harness',
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.maximize()
  void window.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? `file://${join(__dirname, '../renderer/index.html')}`)
}

async function buildProviderStatus(runtime: DesktopRuntime, settings: AppSettings | null) {
  if (!settings) {
    return null
  }

  const provider = getProviderDefinition(settings.provider.provider)
  const { apiKeyPresent } = await runtime.store.getProviderCredentialStatus(settings.provider.provider)
  const issues: string[] = []
  const hints: string[] = []

  if (!apiKeyPresent) {
    issues.push(`Add your ${provider.label} API key before starting a hosted-provider run.`)
  }

  if (settings.provider.provider === 'openrouter' && !settings.provider.model.includes('/')) {
    hints.push('OpenRouter models usually include the provider prefix, for example x-ai/grok-4.1-fast.')
  }

  return providerStatusSchema.parse({
    providerId: provider.adapterId,
    providerLabel: provider.label,
    model: settings.provider.model,
    baseUrl: provider.baseUrl,
    apiKeyLabel: 'Stored securely on this device',
    apiKeyPresent,
    isReady: issues.length === 0,
    issues,
    hints,
  })
}

async function ensureSettings(runtime: DesktopRuntime): Promise<void> {
  const existingSettings = await runtime.store.getSettings()

  if (!existingSettings) {
    const defaultSettings = buildDefaultSettings()
    await mkdir(defaultSettings.workspace.rootPath, { recursive: true })
    await runtime.store.saveSettings(defaultSettings)
  }
}

async function createRuntime(): Promise<DesktopRuntime> {
  const store = await createSqliteStore({
    dataDir: join(app.getPath('userData'), 'data'),
  })
  const eventBus = new InMemoryEventBus()
  const approvalCoordinator = new DesktopApprovalCoordinator()
  const providerCredentialResolver: ProviderCredentialResolver = {
    async getProviderApiKey(provider) {
      const encryptedApiKey = await store.getEncryptedProviderCredential(provider)
      return encryptedApiKey ? decryptApiKey(encryptedApiKey) : null
    },
  }
  const runEngine = new CoreRunEngine({
    store,
    provider: new OpenAICompatibleProvider(),
    providerCredentialResolver,
    actionExecutor: new BuiltInActionExecutor(),
    policy: new StaticPolicy(),
    eventBus,
    approvalCoordinator,
  })
  const runtime: DesktopRuntime = {
    store,
    runEngine,
    eventBus,
    approvalCoordinator,
  }

  await ensureSettings(runtime)

  return runtime
}

async function recoverInterruptedRuns(runtime: DesktopRuntime): Promise<void> {
  const recoverableRuns = await runtime.store.listRuns(['created', 'started', 'waiting_approval'])

  for (const run of recoverableRuns) {
    try {
      await runtime.runEngine.resumeRun(run.id)
    } catch {
      // Leave the persisted run state intact so the renderer can still expose the failure context.
    }
  }
}

function setupEventForwarding(runtime: DesktopRuntime): void {
  runtime.eventBus.subscribe((event) => {
    const parsedEvent = runEventSchema.parse(event)

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(desktopBridgeChannels.runEvent, parsedEvent)
    }
  })
}

function setupIpcHandlers(runtime: DesktopRuntime): void {
  ipcMain.handle(desktopBridgeChannels.getContext, async () => {
    return desktopContextSchema.parse({
      platform: process.platform,
      version: app.getVersion(),
      dataPath: runtime.store.paths.databaseFilePath,
    })
  })

  ipcMain.handle(desktopBridgeChannels.listConversations, async () => {
    return await runtime.store.listConversations()
  })

  ipcMain.handle(desktopBridgeChannels.getProviderStatus, async () => {
    return await buildProviderStatus(runtime, await runtime.store.getSettings())
  })

  ipcMain.handle(desktopBridgeChannels.getProviderCredentialStatus, async (_event, payload) => {
    const input = providerCredentialInputSchema.parse(payload)
    return await runtime.store.getProviderCredentialStatus(input.provider)
  })

  ipcMain.handle(desktopBridgeChannels.saveProviderApiKey, async (_event, payload) => {
    const input = saveProviderApiKeyInputSchema.parse(payload)
    await runtime.store.saveProviderCredential(input.provider, encryptApiKey(input.apiKey.trim()))
  })

  ipcMain.handle(desktopBridgeChannels.clearProviderApiKey, async (_event, payload) => {
    const input = providerCredentialInputSchema.parse(payload)
    await runtime.store.clearProviderCredential(input.provider)
  })

  ipcMain.handle(desktopBridgeChannels.exportData, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Nano Harness data',
      defaultPath: getBackupFileName(),
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })

    if (result.canceled || !result.filePath) {
      return { exportedFilePath: null }
    }

    await runtime.store.backupToFile(result.filePath)
    await runtime.store.sanitizeDatabaseFile(result.filePath)

    return { exportedFilePath: result.filePath }
  })

  ipcMain.handle(desktopBridgeChannels.importData, async () => {
    const activeRuns = await runtime.store.listRuns([...ACTIVE_RUN_STATUSES])

    if (activeRuns.length > 0) {
      throw new Error('Import is unavailable while runs are active. Cancel or wait for active runs before importing data.')
    }

    const result = await dialog.showOpenDialog({
      title: 'Import Nano Harness data',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: false }
    }

    const [selectedFilePath] = result.filePaths
    const backupFilePath = join(runtime.store.paths.dataDir, getTimestampedBackupFileName())

    if (!selectedFilePath) {
      return { imported: false }
    }

    await runtime.store.validateDatabaseFile(selectedFilePath)
    await runtime.store.backupToFile(backupFilePath)
    const stagedFilePath = await runtime.store.createStagedImportCopy(selectedFilePath)

    try {
      await runtime.store.sanitizeDatabaseFile(stagedFilePath)
      await runtime.store.validateDatabaseFile(stagedFilePath)
      await runtime.store.close()
      await copyFile(stagedFilePath, runtime.store.paths.databaseFilePath)
    } finally {
      await rm(stagedFilePath, { force: true })
    }

    app.relaunch()
    app.exit(0)

    return { imported: true, backupFilePath }
  })

  ipcMain.handle(desktopBridgeChannels.getSettings, async () => {
    return await runtime.store.getSettings()
  })

  ipcMain.handle(desktopBridgeChannels.saveSettings, async (_event, payload) => {
    const settings = appSettingsSchema.parse(payload)
    await runtime.store.saveSettings(settings)
    return settings
  })

  ipcMain.handle(desktopBridgeChannels.getConversation, async (_event, payload) => {
    const input = getConversationInputSchema.parse(payload)
    return await runtime.store.getConversation(input.conversationId)
  })

  ipcMain.handle(desktopBridgeChannels.startRun, async (_event, payload) => {
    const input = runCreateInputSchema.parse(payload)
    const handle = await runtime.runEngine.startRun(input)
    return startRunResultSchema.parse({
      runId: handle.runId,
    })
  })

  ipcMain.handle(desktopBridgeChannels.resumeRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.resumeRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.cancelRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.cancelRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.resolveApproval, async (_event, payload) => {
    const input = resolveApprovalInputSchema.parse(payload)
    await runtime.runEngine.resolveApproval(input)
  })
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildApplicationMenu())

  const runtime = await createRuntime()
  setupIpcHandlers(runtime)
  setupEventForwarding(runtime)
  await recoverInterruptedRuns(runtime)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
