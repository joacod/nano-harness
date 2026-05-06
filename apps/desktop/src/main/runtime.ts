import { app, BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { Provider, ProviderGenerateInput, ProviderGenerateResult } from '../../../../packages/core/src'
import { CoreRunEngine, InMemoryEventBus, StaticPolicy } from '../../../../packages/core/src'
import { BuiltInActionExecutor, ChatGptSubscriptionProvider, CompositeActionExecutor, ConfiguredMcpRegistry, MarkdownSkillResolver, McpActionExecutor, OpenAICompatibleProvider, createSqliteStore } from '../../../../packages/infra/src'
import { createDefaultProviderSettings, createDefaultSafetySettings, desktopBridgeChannels, getProviderDefinition, providerStatusSchema, runEventSchema, storedProviderCredentialSchema, type AppSettings, type ProviderAdapterId, type ProviderAuthMethod } from '../../../../packages/shared/src'
import { DesktopApprovalCoordinator } from './approval-coordinator'
import { refreshOpenAIChatGptCredential } from './openai-chatgpt-auth'
import { createProviderCredentialResolver } from './provider-credential-resolver'
import { decryptCredentialPayload, encryptCredentialPayload } from './secure-credentials'

export type DesktopRuntime = {
  store: Awaited<ReturnType<typeof createSqliteStore>>
  runEngine: CoreRunEngine
  skillResolver: MarkdownSkillResolver
  mcpRegistry: ConfiguredMcpRegistry
  eventBus: InMemoryEventBus
  approvalCoordinator: DesktopApprovalCoordinator
}

type ProviderStatusStore = Pick<DesktopRuntime['store'], 'getEncryptedProviderCredentialPayload' | 'getProviderCredentialStatus'>

type EventForwardingRuntime = {
  eventBus: {
    subscribe(listener: (event: Parameters<InMemoryEventBus['publish']>[0]) => void): () => void
  }
}

class DesktopProviderRouter implements Provider {
  private readonly providersByAdapter = {
    'openai-compatible': new OpenAICompatibleProvider(),
    'chatgpt-subscription': new ChatGptSubscriptionProvider(),
  } satisfies Record<ProviderAdapterId, Provider>

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    const providerDefinition = getProviderDefinition(input.settings.provider.provider)
    const provider = this.providersByAdapter[providerDefinition.adapterId]

    if (!provider) {
      throw new Error(`No provider adapter registered for ${providerDefinition.adapterId}.`)
    }

    return await provider.generate(input)
  }
}

function buildDefaultSettings(): AppSettings {
  return {
    provider: createDefaultProviderSettings('openrouter'),
    workspace: {
      rootPath: join(app.getPath('home'), 'nano-harness'),
      approvalPolicy: 'on-request',
    },
    safety: createDefaultSafetySettings(),
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
  let oauthAccountId: string | undefined

  if ((provider.authMethods as readonly ProviderAuthMethod[]).includes('oauth')) {
    const encryptedPayload = await runtime.store.getEncryptedProviderCredentialPayload(settings.provider.provider, 'oauth')

    if (encryptedPayload) {
      try {
        const credential = storedProviderCredentialSchema.parse(decryptCredentialPayload(encryptedPayload))

        if (credential.authMethod === 'oauth') {
          oauthAccountId = credential.accountId
        }
      } catch {
        issues.push(`Reconnect ${provider.label}; the stored credential could not be read.`)
      }
    } else if (provider.missingAuthIssue) {
      issues.push(provider.missingAuthIssue)
    }
  }

  if (provider.requiresApiKey && !apiKeyPresent) {
    issues.push(provider.apiKeyMissingIssue ?? `Add your ${provider.label} API key before starting a hosted-provider run.`)
  }

  if (provider.modelPrefixHint && !settings.provider.model.includes('/')) {
    hints.push(provider.modelPrefixHint)
  }

  hints.push(...provider.statusHints)

  if (oauthAccountId) {
    hints.push(`ChatGPT account: ${oauthAccountId}`)
  }

  return providerStatusSchema.parse({
    providerId: provider.adapterId,
    providerLabel: provider.label,
    model: settings.provider.model,
    baseUrl,
    apiKeyLabel: provider.apiKeyLabel,
    apiKeyPresent,
    authMethod: provider.defaultAuthMethod,
    authLabel: provider.authLabels[provider.defaultAuthMethod] ?? provider.defaultAuthMethod,
    authPresent: credentialStatus.authMethods?.some((credential) => credential.authMethod === provider.defaultAuthMethod && credential.present) ?? false,
    authMethods: provider.authMethods.map((authMethod) => ({
      authMethod,
      label: provider.authLabels[authMethod] ?? authMethod,
      present: credentialStatus.authMethods?.some((credential) => credential.authMethod === authMethod && credential.present) ?? false,
      accountId: authMethod === 'oauth' ? oauthAccountId : undefined,
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
  const providerCredentialResolver = createProviderCredentialResolver({
    store,
    decryptCredentialPayload,
    encryptCredentialPayload,
    refreshers: {
      openai: refreshOpenAIChatGptCredential,
    },
  })
  const skillResolver = new MarkdownSkillResolver()
  const mcpRegistry = new ConfiguredMcpRegistry()
  const runEngine = new CoreRunEngine({
    store,
    provider: new DesktopProviderRouter(),
    providerCredentialResolver,
    skillResolver,
    mcpRegistry,
    actionExecutor: new CompositeActionExecutor([
      new BuiltInActionExecutor(),
      new McpActionExecutor(mcpRegistry),
    ]),
    policy: new StaticPolicy(),
    eventBus,
    approvalCoordinator,
  })
  const runtime: DesktopRuntime = {
    store,
    runEngine,
    skillResolver,
    mcpRegistry,
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
