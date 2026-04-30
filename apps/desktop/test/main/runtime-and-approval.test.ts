import { describe, expect, it, vi } from 'vitest'

import type { ProviderKey, RunEvent } from '@nano-harness/shared'

const { getAllWindows } = vi.hoisted(() => ({
  getAllWindows: vi.fn<() => Array<{ webContents: { send: (channel: string, payload: RunEvent) => void } }>>(() => []),
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'home') {
        return '/Users/test'
      }

      if (name === 'userData') {
        return '/Users/test/Library/Application Support/Nano Harness'
      }

      return '/tmp'
    }),
  },
  BrowserWindow: {
    getAllWindows,
  },
}))

import { DesktopApprovalCoordinator } from '../../src/main/approval-coordinator'
import { buildProviderStatus, setupEventForwarding } from '../../src/main/runtime'

type ProviderStatusRuntime = {
  store: {
    getProviderCredentialStatus(provider: ProviderKey): Promise<{ apiKeyPresent: boolean }>
    getEncryptedProviderCredentialPayload(provider: ProviderKey, authMethod: 'api-key' | 'none' | 'oauth'): Promise<string | null>
  }
}

type EventForwardingRuntime = {
  eventBus: {
    subscribe(listener: (event: RunEvent) => void): () => void
  }
}

describe('desktop runtime helpers', () => {
  it('returns null provider status when settings are missing', async () => {
    const runtime = {
      store: {
        getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: false })),
        getEncryptedProviderCredentialPayload: vi.fn(async () => null),
      },
    } satisfies ProviderStatusRuntime

    await expect(buildProviderStatus(runtime, null)).resolves.toBeNull()
  })

  it('reports readiness issues when the api key is missing', async () => {
    const runtime = {
      store: {
        getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: false })),
        getEncryptedProviderCredentialPayload: vi.fn(async () => null),
      },
    } satisfies ProviderStatusRuntime

    const result = await buildProviderStatus(runtime, {
      provider: {
        provider: 'openrouter',
        model: 'x-ai/grok-4.1-fast',
      },
      workspace: {
        rootPath: '/workspace',
        approvalPolicy: 'on-request',
      },
    })

    expect(result).toMatchObject({
      apiKeyPresent: false,
      isReady: false,
      issues: ['Add your OpenRouter API key before starting a hosted-provider run.'],
      hints: [],
    })
  })

  it('marks the provider ready and adds an openrouter model hint when needed', async () => {
    const runtime = {
      store: {
        getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: true })),
        getEncryptedProviderCredentialPayload: vi.fn(async () => null),
      },
    } satisfies ProviderStatusRuntime

    const result = await buildProviderStatus(runtime, {
      provider: {
        provider: 'openrouter',
        model: 'grok-4.1-fast',
      },
      workspace: {
        rootPath: '/workspace',
        approvalPolicy: 'on-request',
      },
    })

    expect(result).toMatchObject({
      apiKeyPresent: true,
      isReady: true,
      issues: [],
      hints: ['OpenRouter models usually include the provider prefix, for example x-ai/grok-4.1-fast.'],
    })
  })

  it('marks llama.cpp ready without an api key', async () => {
    const runtime = {
      store: {
        getProviderCredentialStatus: vi.fn(async () => ({ apiKeyPresent: false })),
        getEncryptedProviderCredentialPayload: vi.fn(async () => null),
      },
    } satisfies ProviderStatusRuntime

    const result = await buildProviderStatus(runtime, {
      provider: {
        provider: 'llama-cpp',
        model: 'local-model',
        baseUrl: 'http://127.0.0.1:8080/v1',
      },
      workspace: {
        rootPath: '/workspace',
        approvalPolicy: 'on-request',
      },
    })

    expect(result).toMatchObject({
      apiKeyPresent: false,
      isReady: true,
      baseUrl: 'http://127.0.0.1:8080/v1',
      issues: [],
      hints: ['Start llama-server before running a local model. The API endpoint should expose /v1/chat/completions.'],
    })
  })

  it('forwards parsed run events to every open browser window', () => {
    const sendFirst = vi.fn()
    const sendSecond = vi.fn()
    getAllWindows.mockReturnValue([
      { webContents: { send: sendFirst } },
      { webContents: { send: sendSecond } },
    ])

    let subscribedListener: ((event: RunEvent) => void) | undefined
    const runtime = {
      eventBus: {
        subscribe(listener: (event: RunEvent) => void) {
          subscribedListener = listener
          return () => {}
        },
      },
    } satisfies EventForwardingRuntime

    setupEventForwarding(runtime)

    const event: RunEvent = {
      id: 'event-1',
      runId: 'run-1',
      timestamp: '2026-04-29T10:00:00.000Z',
      type: 'run.completed',
      payload: {
        finishedAt: '2026-04-29T10:00:00.000Z',
      },
    }

    subscribedListener?.(event)

    expect(sendFirst).toHaveBeenCalledWith('desktop:run-event', event)
    expect(sendSecond).toHaveBeenCalledWith('desktop:run-event', event)
  })
})

describe('DesktopApprovalCoordinator', () => {
  it('resolves a pending approval decision', async () => {
    const coordinator = new DesktopApprovalCoordinator()
    const promise = coordinator.waitForDecision({
      request: {
        id: 'approval-1',
        runId: 'run-1',
        actionCallId: 'call-1',
        reason: 'Need approval',
        requestedAt: '2026-04-29T10:00:00.000Z',
      },
      run: {
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'waiting_approval',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      settings: {
        provider: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
        workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
      },
      signal: new AbortController().signal,
    })

    expect(await coordinator.resolveDecision({ approvalRequestId: 'approval-1', decision: 'granted' })).toBe(true)

    await expect(promise).resolves.toMatchObject({
      approvalRequestId: 'approval-1',
      decision: 'granted',
    })
  })

  it('returns false for unknown approval requests', async () => {
    const coordinator = new DesktopApprovalCoordinator()

    await expect(coordinator.resolveDecision({ approvalRequestId: 'missing', decision: 'rejected' })).resolves.toBe(false)
  })

  it('rejects with AbortError when the wait signal is aborted', async () => {
    const coordinator = new DesktopApprovalCoordinator()
    const controller = new AbortController()
    const promise = coordinator.waitForDecision({
      request: {
        id: 'approval-1',
        runId: 'run-1',
        actionCallId: 'call-1',
        reason: 'Need approval',
        requestedAt: '2026-04-29T10:00:00.000Z',
      },
      run: {
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'waiting_approval',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      settings: {
        provider: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
        workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
      },
      signal: controller.signal,
    })

    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError', message: 'Approval wait aborted' })
    await expect(coordinator.resolveDecision({ approvalRequestId: 'approval-1', decision: 'granted' })).resolves.toBe(false)
  })
})
