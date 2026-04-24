import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ApprovalCoordinator } from '../../../../packages/core/src'
import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { BuiltInActionExecutor, OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import {
  appSettingsSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  getProviderDefinition,
  providerStatusSchema,
  resolveApprovalInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  startRunResultSchema,
  type AppSettings,
} from '../../../../packages/shared/src'

app.setName('Nano Harness')

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

type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  eventBus: InMemoryEventBus
  approvalCoordinator: DesktopApprovalCoordinator
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
      apiKey: '',
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

function buildProviderStatus(settings: AppSettings | null) {
  if (!settings) {
    return null
  }

  const provider = getProviderDefinition(settings.provider.provider)
  const apiKeyPresent = Boolean(settings.provider.apiKey.trim())
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
    apiKeyLabel: 'Stored in app settings',
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
  const runEngine = new CoreRunEngine({
    store,
    provider: new OpenAICompatibleProvider(),
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
    })
  })

  ipcMain.handle(desktopBridgeChannels.listConversations, async () => {
    return await runtime.store.listConversations()
  })

  ipcMain.handle(desktopBridgeChannels.getProviderStatus, async () => {
    return buildProviderStatus(await runtime.store.getSettings())
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

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(getAppIconPath()))
  }

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
