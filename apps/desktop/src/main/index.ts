import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import {
  appSettingsSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  getConversationInputSchema,
  runCreateInputSchema,
  runEventSchema,
  runIdInputSchema,
  startRunResultSchema,
  type AppSettings,
} from '../../../../packages/shared/src'

type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  eventBus: InMemoryEventBus
}

class UnsupportedActionExecutor {
  async getDefinition(): Promise<null> {
    return null
  }

  async execute(): Promise<never> {
    throw new Error('Action execution is not configured yet')
  }
}

function buildDefaultSettings(): AppSettings {
  return {
    provider: {
      providerId: 'openai-compatible',
      model: process.env['OPENAI_MODEL'] ?? 'gpt-4.1-mini',
      apiKeyEnvVar: process.env['OPENAI_API_KEY_ENV_VAR'] ?? 'OPENAI_API_KEY',
      baseUrl: process.env['OPENAI_BASE_URL'] || undefined,
    },
    workspace: {
      rootPath: app.getPath('home'),
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
    title: 'nano-harness',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  void window.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? `file://${join(__dirname, '../renderer/index.html')}`)
}

async function ensureSettings(runtime: DesktopRuntime): Promise<void> {
  const existingSettings = await runtime.store.getSettings()

  if (!existingSettings) {
    await runtime.store.saveSettings(buildDefaultSettings())
  }
}

async function createRuntime(): Promise<DesktopRuntime> {
  const store = await createSqliteStore({
    dataDir: join(app.getPath('userData'), 'data'),
  })
  const eventBus = new InMemoryEventBus()
  const runEngine = new CoreRunEngine({
    store,
    provider: new OpenAICompatibleProvider(),
    actionExecutor: new UnsupportedActionExecutor(),
    policy: new StaticPolicy(),
    eventBus,
  })
  const runtime: DesktopRuntime = {
    store,
    runEngine,
    eventBus,
  }

  await ensureSettings(runtime)

  return runtime
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
}

void app.whenReady().then(async () => {
  const runtime = await createRuntime()
  setupIpcHandlers(runtime)
  setupEventForwarding(runtime)
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
