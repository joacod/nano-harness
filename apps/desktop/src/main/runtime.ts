import { app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProviderCredentialResolver } from '../../../../packages/core/src'
import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { BuiltInActionExecutor, OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import { desktopBridgeChannels, getProviderDefinition, providerStatusSchema, runEventSchema, type AppSettings } from '../../../../packages/shared/src'
import { DesktopApprovalCoordinator } from './approval-coordinator'
import { decryptApiKey } from './secure-credentials'

export type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  eventBus: InMemoryEventBus
  approvalCoordinator: DesktopApprovalCoordinator
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

export async function buildProviderStatus(runtime: DesktopRuntime, settings: AppSettings | null) {
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

export async function createRuntime(): Promise<DesktopRuntime> {
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

export async function recoverInterruptedRuns(runtime: DesktopRuntime): Promise<void> {
  const recoverableRuns = await runtime.store.listRuns(['created', 'started', 'waiting_approval'])

  for (const run of recoverableRuns) {
    try {
      await runtime.runEngine.resumeRun(run.id)
    } catch {
      // Leave the persisted run state intact so the renderer can still expose the failure context.
    }
  }
}

export function setupEventForwarding(runtime: DesktopRuntime): void {
  runtime.eventBus.subscribe((event) => {
    const parsedEvent = runEventSchema.parse(event)

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(desktopBridgeChannels.runEvent, parsedEvent)
    }
  })
}
