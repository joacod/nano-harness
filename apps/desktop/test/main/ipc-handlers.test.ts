import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultProviderSettings, providerDefaultModels, type AppSettings, type ConversationSnapshot } from '@nano-harness/shared'

const { handlers, handle, openExternal, exportData, importData, exportRunEvidence, buildProviderStatus, encryptCredentialPayload, startOpenAIChatGptOAuth } = vi.hoisted(() => {
  const handlers = new Map<string, (_event: unknown, payload?: unknown) => Promise<unknown>>()

  return {
    handlers,
    handle: vi.fn((channel: string, callback: (_event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, callback)
    }),
    openExternal: vi.fn(async () => {}),
    exportData: vi.fn(async () => ({ exportedFilePath: '/tmp/export.db' })),
    importData: vi.fn(async () => ({ imported: true, backupFilePath: '/tmp/backup.db' })),
    exportRunEvidence: vi.fn(async () => ({ exportedFilePath: '/tmp/run-evidence.json', changedFiles: [], validationOutputs: 0 })),
    buildProviderStatus: vi.fn(async () => ({
      providerId: 'openai-compatible',
      providerLabel: 'OpenRouter',
      model: providerDefaultModels.openrouter,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyLabel: 'Stored securely on this device',
      apiKeyPresent: true,
      isReady: true,
      issues: [],
      hints: [],
    })),
    encryptCredentialPayload: vi.fn((payload: unknown) => `encrypted:${JSON.stringify(payload)}`),
    startOpenAIChatGptOAuth: vi.fn(async () => ({
      authMethod: 'oauth' as const,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'account-1',
    })),
  }
})

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.2.3'),
  },
  ipcMain: {
    handle,
  },
  shell: {
    openExternal,
  },
}))

vi.mock('../../src/main/data-transfer', () => ({ exportData, importData }))
vi.mock('../../src/main/run-evidence-export', () => ({ exportRunEvidence }))
vi.mock('../../src/main/openai-chatgpt-auth', () => ({ startOpenAIChatGptOAuth }))
vi.mock('../../src/main/runtime', async () => {
  const actual = await vi.importActual<typeof import('../../src/main/runtime')>('../../src/main/runtime')
  return {
    ...actual,
    buildProviderStatus,
  }
})
vi.mock('../../src/main/secure-credentials', () => ({ encryptCredentialPayload }))

import { desktopBridgeChannels } from '@nano-harness/shared'
import { setupIpcHandlers } from '../../src/main/ipc-handlers'

describe('setupIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handle.mockClear()
    openExternal.mockClear()
    exportData.mockClear()
    importData.mockClear()
    exportRunEvidence.mockClear()
    buildProviderStatus.mockClear()
    encryptCredentialPayload.mockClear()
    startOpenAIChatGptOAuth.mockClear()
  })

  it('registers the expected desktop bridge handlers', () => {
    setupIpcHandlers(createRuntime())

    expect(handle).toHaveBeenCalledTimes(Object.keys(desktopBridgeChannels).length - 1)
    expect(handlers.has(desktopBridgeChannels.saveSettings)).toBe(true)
    expect(handlers.has(desktopBridgeChannels.startRun)).toBe(true)
    expect(handlers.has(desktopBridgeChannels.openExternalUrl)).toBe(true)
  })

  it('validates and saves settings', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    const result = await invokeHandler(desktopBridgeChannels.saveSettings, {
      provider: createDefaultProviderSettings('openrouter'),
      workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
    })

    expect(runtime.store.saveSettings).toHaveBeenCalledWith({
      provider: createDefaultProviderSettings('openrouter'),
      workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
    })
    expect(result).toMatchObject({
      provider: { provider: 'openrouter' },
      workspace: { rootPath: '/workspace' },
    })
  })

  it('lists skills with content omitted from IPC output', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.listSkills)).resolves.toEqual({
      skills: [expect.objectContaining({ id: 'repo-onboarding', name: 'Repo Onboarding' })],
    })
    expect(runtime.skillResolver.listSkills).toHaveBeenCalled()
  })

  it('delegates session list, fork, clone, and export handlers', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.listSessions)).resolves.toEqual([])
    await expect(invokeHandler(desktopBridgeChannels.forkSession, { sessionId: 'conversation-1' })).resolves.toEqual({
      sessionId: 'conversation-1-fork',
      conversationId: 'conversation-1-fork',
    })
    await expect(invokeHandler(desktopBridgeChannels.cloneSession, { sessionId: 'conversation-1' })).resolves.toEqual({
      sessionId: 'conversation-1-clone',
      conversationId: 'conversation-1-clone',
    })
    await expect(invokeHandler(desktopBridgeChannels.exportSession, { sessionId: 'conversation-1' })).resolves.toMatchObject({
      exportedFilePath: expect.stringContaining('conversation-1-session.json'),
    })
  })

  it('lists MCP inventory through the registry', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.listMcpInventory)).resolves.toEqual({
      servers: [],
      tools: [],
      resources: [],
    })
    expect(runtime.mcpRegistry.getInventory).toHaveBeenCalled()
  })

  it('delegates getConversation, startRun, cancelRun, and resolveApproval', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.getConversation, { conversationId: 'conversation-1' })).resolves.toEqual({
      conversation: null,
      runs: [],
      messages: [],
      events: [],
      approvalRequests: [],
      approvalResolutions: [],
    })
    await expect(invokeHandler(desktopBridgeChannels.startRun, { conversationId: 'conversation-1', prompt: 'Hello' })).resolves.toEqual({
      runId: 'run-123',
    })

    await invokeHandler(desktopBridgeChannels.cancelRun, { runId: 'run-123' })
    await invokeHandler(desktopBridgeChannels.resolveApproval, {
      runId: 'run-123',
      approvalRequestId: 'approval-1',
      decision: 'granted',
    })

    expect(runtime.store.getConversation).toHaveBeenCalledWith('conversation-1')
    expect(runtime.runEngine.startRun).toHaveBeenCalledWith({ conversationId: 'conversation-1', prompt: 'Hello' })
    expect(runtime.runEngine.cancelRun).toHaveBeenCalledWith('run-123')
    expect(runtime.runEngine.resolveApproval).toHaveBeenCalledWith({
      runId: 'run-123',
      approvalRequestId: 'approval-1',
      decision: 'granted',
    })
  })

  it('exports run evidence through the dedicated handler', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.exportRunEvidence, { runId: 'run-123' })).resolves.toEqual({
      exportedFilePath: '/tmp/run-evidence.json',
      changedFiles: [],
      validationOutputs: 0,
    })
    expect(exportRunEvidence).toHaveBeenCalledWith(runtime, 'run-123')
  })

  it('encrypts trimmed provider api keys before saving', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await invokeHandler(desktopBridgeChannels.saveProviderAuth, {
      provider: 'openrouter',
      authMethod: 'api-key',
      apiKey: '  secret-key  ',
    })

    expect(encryptCredentialPayload).toHaveBeenCalledWith({ authMethod: 'api-key', apiKey: 'secret-key' })
    expect(runtime.store.saveProviderCredentialPayload).toHaveBeenCalledWith(
      'openrouter',
      'api-key',
      'encrypted:{"authMethod":"api-key","apiKey":"secret-key"}',
    )
  })

  it('starts OpenAI OAuth and stores the encrypted credential', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(invokeHandler(desktopBridgeChannels.startProviderOauth, { provider: 'openai' })).resolves.toEqual({
      provider: 'openai',
      accountId: 'account-1',
    })

    expect(startOpenAIChatGptOAuth).toHaveBeenCalledWith({ openExternal: expect.any(Function) })
    expect(encryptCredentialPayload).toHaveBeenCalledWith({
      authMethod: 'oauth',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'account-1',
    })
    expect(runtime.store.saveProviderCredentialPayload).toHaveBeenCalledWith(
      'openai',
      'oauth',
      'encrypted:{"authMethod":"oauth","accessToken":"access-token","refreshToken":"refresh-token","expiresAt":123456,"accountId":"account-1"}',
    )
  })

  it('rejects OAuth for providers that do not support it', async () => {
    setupIpcHandlers(createRuntime())

    await expect(invokeHandler(desktopBridgeChannels.startProviderOauth, { provider: 'openrouter' })).rejects.toThrow(
      'OpenRouter does not support OAuth sign-in.',
    )
  })

  it('clears provider auth for the selected auth method', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await invokeHandler(desktopBridgeChannels.clearProviderAuth, { provider: 'openai' })
    await invokeHandler(desktopBridgeChannels.clearProviderAuth, { provider: 'openrouter', authMethod: 'api-key' })

    expect(runtime.store.clearProviderCredential).toHaveBeenNthCalledWith(1, 'openai', 'oauth')
    expect(runtime.store.clearProviderCredential).toHaveBeenNthCalledWith(2, 'openrouter', 'api-key')
  })

  it('opens only http and https external urls', async () => {
    setupIpcHandlers(createRuntime())

    await invokeHandler(desktopBridgeChannels.openExternalUrl, {
      url: 'https://example.com/docs',
    })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs')

    await expect(
      invokeHandler(desktopBridgeChannels.openExternalUrl, {
        url: 'file:///tmp/secret.txt',
      }),
    ).rejects.toThrow('Only http and https links can be opened externally.')
  })

  it('rejects invalid IPC payloads before delegating', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime)

    await expect(
      invokeHandler(desktopBridgeChannels.startRun, {
        conversationId: 'conversation-1',
        prompt: '',
      }),
    ).rejects.toThrow()

    expect(runtime.runEngine.startRun).not.toHaveBeenCalled()
  })
})

function createRuntime() {
  const settings: AppSettings = {
    provider: createDefaultProviderSettings('openrouter'),
    workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
  }
  const snapshot: ConversationSnapshot = {
    conversation: null,
    runs: [],
    messages: [],
    events: [],
    approvalRequests: [],
    approvalResolutions: [],
  }

  return {
    store: {
      paths: { dataDir: '/tmp', databaseFilePath: '/tmp/nano-harness.db' },
      listConversations: vi.fn(async () => []),
      listSessions: vi.fn(async () => []),
      listRuns: vi.fn(async () => []),
      listMemoryRecords: vi.fn(async () => []),
      listMemoryProposals: vi.fn(async () => []),
      resolveMemoryProposal: vi.fn(async () => ({
        id: 'proposal-1',
        runId: 'run-1',
        category: 'workflow' as const,
        content: 'Run tests after edits.',
        rationale: 'Validation workflow.',
        evidence: [],
        status: 'approved' as const,
        createdAt: '2026-04-29T10:00:00.000Z',
        decidedAt: '2026-04-29T10:00:01.000Z',
      })),
      getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: true })),
      getEncryptedProviderCredentialPayload: vi.fn(async () => null),
      saveProviderCredentialPayload: vi.fn(async () => {}),
      clearProviderCredential: vi.fn(async () => {}),
      getSettings: vi.fn(async () => settings),
      saveSettings: vi.fn(async () => {}),
      getConversation: vi.fn(async () => snapshot),
      getRun: vi.fn(async () => null),
      forkSession: vi.fn(async (sessionId: string) => ({
        id: `${sessionId}-fork`,
        conversationId: `${sessionId}-fork`,
        parentSessionId: sessionId,
        rootSessionId: sessionId,
        title: 'Fork',
        createdAt: '2026-04-29T10:00:00.000Z',
        updatedAt: '2026-04-29T10:00:00.000Z',
      })),
      cloneSession: vi.fn(async (sessionId: string) => ({
        id: `${sessionId}-clone`,
        conversationId: `${sessionId}-clone`,
        parentSessionId: sessionId,
        rootSessionId: sessionId,
        title: 'Clone',
        createdAt: '2026-04-29T10:00:00.000Z',
        updatedAt: '2026-04-29T10:00:00.000Z',
      })),
      exportSession: vi.fn(async () => ({
        session: {
          id: 'session-1',
          conversationId: 'session-1',
          parentSessionId: null,
          rootSessionId: 'session-1',
          title: 'Session',
          createdAt: '2026-04-29T10:00:00.000Z',
          updatedAt: '2026-04-29T10:00:00.000Z',
        },
        lineage: [],
        runs: [],
        messages: [],
        events: [],
        approvals: { requests: [], resolutions: [] },
      })),
      backupToFile: vi.fn(async () => {}),
      sanitizeDatabaseFile: vi.fn(async () => {}),
      validateDatabaseFile: vi.fn(async () => {}),
      createStagedImportCopy: vi.fn(async () => '/tmp/staged.db'),
      close: vi.fn(async () => {}),
    },
    skillResolver: {
      listSkills: vi.fn(async () => [
        {
          id: 'repo-onboarding',
          name: 'Repo Onboarding',
          description: 'Survey repositories.',
          triggers: ['repo'],
          tools: ['grep'],
          safetyNotes: [],
          source: 'bundled' as const,
          enabled: true,
          content: 'Read first.',
        },
      ]),
    },
    mcpRegistry: {
      getInventory: vi.fn(async () => ({ servers: [], tools: [], resources: [] })),
    },
    runEngine: {
      startRun: vi.fn(async () => ({ runId: 'run-123', cancel: async () => {} })),
      resumeRun: vi.fn(async () => {}),
      cancelRun: vi.fn(async () => {}),
      resolveApproval: vi.fn(async () => {}),
    },
  }
}

async function invokeHandler(channel: string, payload?: unknown) {
  const handler = handlers.get(channel)

  if (!handler) {
    throw new Error(`Missing handler for ${channel}`)
  }

  return await handler({}, payload)
}
