import { app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProviderCredentialResolver } from '../../../../packages/core/src'
import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { BuiltInActionExecutor, OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import { desktopBridgeChannels, getProviderDefinition, providerAuthSchema, providerStatusSchema, runEventSchema, storedProviderCredentialSchema, type AppSettings, type ProviderAuthMethod } from '../../../../packages/shared/src'
import { DesktopApprovalCoordinator } from './approval-coordinator'
import { decryptCredentialPayload } from './secure-credentials'

export type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  eventBus: InMemoryEventBus
  approvalCoordinator: DesktopApprovalCoordinator
}

type ProviderStatusStore = Pick<DesktopRuntime['store'], 'getProviderCredentialStatus'>

type EventForwardingRuntime = {
  eventBus: {
    subscribe(listener: (event: Parameters<InMemoryEventBus['publish']>[0]) => void): () => void
  }
}

function buildDefaultSettings(): AppSettings {
  const provider = getProviderDefinition('openrouter')

  return {
    provider: {
      provider: provider.key,
      model: provider.defaultModel,
      baseUrl: provider.baseUrl,
    },
    workspace: {
      rootPath: join(app.getPath('home'), 'nano-harness'),
      approvalPolicy: 'on-request',
    },
  }
}

export async function buildProviderStatus(runtime: { store: ProviderStatusStore }, settings: AppSettings | null) {
  if (!settings) {
    return null
  }

  const provider = getProviderDefinition(settings.provider.provider)
  const credentialStatus = await runtime.store.getProviderCredentialStatus(settings.provider.provider)
  const { apiKeyPresent } = credentialStatus
  const baseUrl = settings.provider.baseUrl?.trim() || provider.baseUrl
  const issues: string[] = []
  const hints: string[] = []

  if (provider.requiresApiKey && !apiKeyPresent) {
    issues.push(`Add your ${provider.label} API key before starting a hosted-provider run.`)
  }

  if (settings.provider.provider === 'openrouter' && !settings.provider.model.includes('/')) {
    hints.push('OpenRouter models usually include the provider prefix, for example x-ai/grok-4.1-fast.')
  }

  if (settings.provider.provider === 'llama-cpp') {
    hints.push('Start llama-server before running a local model. The API endpoint should expose /v1/chat/completions.')
  }

  return providerStatusSchema.parse({
    providerId: provider.adapterId,
    providerLabel: provider.label,
    model: settings.provider.model,
    baseUrl,
    apiKeyLabel: provider.requiresApiKey ? 'Stored securely on this device' : 'Optional for this local provider',
    apiKeyPresent,
    authMethod: provider.defaultAuthMethod,
    authLabel: provider.defaultAuthMethod === 'api-key' ? 'API key' : provider.defaultAuthMethod,
    authPresent: credentialStatus.authMethods?.some((credential) => credential.authMethod === provider.defaultAuthMethod && credential.present) ?? false,
    authMethods: provider.authMethods.map((authMethod) => ({
      authMethod,
      label: authMethod === 'api-key' ? 'API key' : authMethod,
      present: credentialStatus.authMethods?.some((credential) => credential.authMethod === authMethod && credential.present) ?? false,
    })),
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
    async getProviderAuth(input) {
      const providerDefinition = getProviderDefinition(input.provider)
      const authMethod = input.authMethod ?? providerDefinition.defaultAuthMethod

      if (!(providerDefinition.authMethods as readonly ProviderAuthMethod[]).includes(authMethod)) {
        throw new Error(`${providerDefinition.label} does not support ${authMethod} auth.`)
      }

      if (authMethod === 'none') {
        return { authMethod: 'none' }
      }

      const encryptedPayload = await store.getEncryptedProviderCredentialPayload(input.provider, authMethod)

      if (!encryptedPayload) {
        return providerAuthSchema.parse({ authMethod: 'none' })
      }

      const credential = storedProviderCredentialSchema.parse(decryptCredentialPayload(encryptedPayload))

      if (credential.authMethod !== authMethod) {
        throw new Error(`Stored credential does not match ${providerDefinition.label} ${authMethod} auth.`)
      }

      return providerAuthSchema.parse(credential)
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

export function setupEventForwarding(runtime: EventForwardingRuntime): void {
  runtime.eventBus.subscribe((event) => {
    const parsedEvent = runEventSchema.parse(event)

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(desktopBridgeChannels.runEvent, parsedEvent)
    }
  })
}
