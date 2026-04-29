import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, handle, openExternal, exportData, importData, buildProviderStatus, encryptApiKey } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()

  return {
    handlers,
    handle: vi.fn((channel: string, callback: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, callback)
    }),
    openExternal: vi.fn(async () => {}),
    exportData: vi.fn(async () => ({ exportedFilePath: '/tmp/export.db' })),
    importData: vi.fn(async () => ({ imported: true, backupFilePath: '/tmp/backup.db' })),
    buildProviderStatus: vi.fn(async () => ({
      providerId: 'openai-compatible',
      providerLabel: 'OpenRouter',
      model: 'x-ai/grok-4.1-fast',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyLabel: 'Stored securely on this device',
      apiKeyPresent: true,
      isReady: true,
      issues: [],
      hints: [],
    })),
    encryptApiKey: vi.fn((apiKey: string) => `encrypted:${apiKey}`),
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
vi.mock('../../src/main/runtime', async () => {
  const actual = await vi.importActual<typeof import('../../src/main/runtime')>('../../src/main/runtime')
  return {
    ...actual,
    buildProviderStatus,
  }
})
vi.mock('../../src/main/secure-credentials', () => ({ encryptApiKey }))

import { desktopBridgeChannels } from '@nano-harness/shared'
import { setupIpcHandlers } from '../../src/main/ipc-handlers'

describe('setupIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handle.mockClear()
    openExternal.mockClear()
    exportData.mockClear()
    importData.mockClear()
    buildProviderStatus.mockClear()
    encryptApiKey.mockClear()
  })

  it('registers the expected desktop bridge handlers', () => {
    setupIpcHandlers(createRuntime() as never)

    expect(handle).toHaveBeenCalledTimes(Object.keys(desktopBridgeChannels).length - 1)
    expect(handlers.has(desktopBridgeChannels.saveSettings)).toBe(true)
    expect(handlers.has(desktopBridgeChannels.startRun)).toBe(true)
    expect(handlers.has(desktopBridgeChannels.openExternalUrl)).toBe(true)
  })

  it('validates and saves settings', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime as never)

    const result = await invokeHandler(desktopBridgeChannels.saveSettings, {
      provider: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
      workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
    })

    expect(runtime.store.saveSettings).toHaveBeenCalledWith({
      provider: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
      workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
    })
    expect(result).toMatchObject({
      provider: { provider: 'openrouter' },
      workspace: { rootPath: '/workspace' },
    })
  })

  it('delegates getConversation, startRun, cancelRun, and resolveApproval', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime as never)

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

  it('encrypts trimmed provider api keys before saving', async () => {
    const runtime = createRuntime()
    setupIpcHandlers(runtime as never)

    await invokeHandler(desktopBridgeChannels.saveProviderApiKey, {
      provider: 'openrouter',
      apiKey: '  secret-key  ',
    })

    expect(encryptApiKey).toHaveBeenCalledWith('secret-key')
    expect(runtime.store.saveProviderCredential).toHaveBeenCalledWith('openrouter', 'encrypted:secret-key')
  })

  it('opens only http and https external urls', async () => {
    setupIpcHandlers(createRuntime() as never)

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
    setupIpcHandlers(runtime as never)

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
  return {
    store: {
      paths: { databaseFilePath: '/tmp/nano-harness.db' },
      listConversations: vi.fn(async () => []),
      getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: true })),
      saveProviderCredential: vi.fn(async () => {}),
      clearProviderCredential: vi.fn(async () => {}),
      getSettings: vi.fn(async () => ({
        provider: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
        workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
      })),
      saveSettings: vi.fn(async () => {}),
      getConversation: vi.fn(async () => ({
        conversation: null,
        runs: [],
        messages: [],
        events: [],
        approvalRequests: [],
        approvalResolutions: [],
      })),
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
