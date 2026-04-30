import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopApi, RunEvent } from '@nano-harness/shared'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const off = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    off,
  },
}))

import { desktopBridgeChannels } from '@nano-harness/shared'

describe('desktop preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    off.mockReset()
    vi.resetModules()
  })

  it('exposes the desktop API in the preload script', async () => {
    await import('../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledWith('desktop', expect.any(Object))
  })

  it('validates outgoing payloads and parses incoming responses', async () => {
    invoke.mockResolvedValueOnce({
      conversation: null,
      runs: [],
      messages: [],
      events: [],
      approvalRequests: [],
      approvalResolutions: [],
    })

    const desktop = await loadDesktopApi()
    const result = await desktop.getConversation({ conversationId: 'conversation-1' })

    expect(invoke).toHaveBeenCalledWith(desktopBridgeChannels.getConversation, { conversationId: 'conversation-1' })
    expect(result).toMatchObject({ conversation: null, runs: [] })

    await expect(desktop.getConversation({ conversationId: '' })).rejects.toThrow()
  })

  it('throws when the main process returns an invalid response shape', async () => {
    invoke.mockResolvedValueOnce({ nope: true })
    const desktop = await loadDesktopApi()

    await expect(desktop.getContext()).rejects.toThrow()
  })

  it('passes validated payloads for mutating commands', async () => {
    invoke.mockResolvedValue(undefined)
    const desktop = await loadDesktopApi()

    await desktop.saveProviderAuth({ provider: 'openrouter', authMethod: 'api-key', apiKey: 'secret' })
    await desktop.clearProviderAuth({ provider: 'openrouter', authMethod: 'api-key' })
    await desktop.openExternalUrl({ url: 'https://example.com' })
    await desktop.cancelRun({ runId: 'run-1' })
    await desktop.resolveApproval({ runId: 'run-1', approvalRequestId: 'approval-1', decision: 'granted' })

    expect(invoke).toHaveBeenNthCalledWith(1, desktopBridgeChannels.saveProviderAuth, {
      provider: 'openrouter',
      authMethod: 'api-key',
      apiKey: 'secret',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, desktopBridgeChannels.clearProviderAuth, {
      provider: 'openrouter',
      authMethod: 'api-key',
    })
    expect(invoke).toHaveBeenNthCalledWith(3, desktopBridgeChannels.openExternalUrl, { url: 'https://example.com' })
    expect(invoke).toHaveBeenNthCalledWith(4, desktopBridgeChannels.cancelRun, { runId: 'run-1' })
    expect(invoke).toHaveBeenNthCalledWith(5, desktopBridgeChannels.resolveApproval, {
      runId: 'run-1',
      approvalRequestId: 'approval-1',
      decision: 'granted',
    })

    await expect(desktop.openExternalUrl({ url: 'notaurl' })).rejects.toThrow()
  })

  it('parses OAuth result payloads', async () => {
    invoke.mockResolvedValueOnce({ provider: 'openai', accountId: 'account-1' })
    const desktop = await loadDesktopApi()

    await expect(desktop.startProviderOauth({ provider: 'openai' })).resolves.toEqual({
      provider: 'openai',
      accountId: 'account-1',
    })
    expect(invoke).toHaveBeenCalledWith(desktopBridgeChannels.startProviderOauth, { provider: 'openai' })
  })

  it('subscribes to parsed run events and unsubscribes correctly', async () => {
    const desktop = await loadDesktopApi()
    const listener = vi.fn()

    let wrappedListener: ((event: unknown, payload: RunEvent) => void) | undefined
    on.mockImplementation((_channel: string, callback: (event: unknown, payload: RunEvent) => void) => {
      wrappedListener = callback
    })

    const unsubscribe = desktop.onRunEvent(listener)
    wrappedListener?.({}, {
      id: 'event-1',
      runId: 'run-1',
      timestamp: '2026-04-29T10:00:00.000Z',
      type: 'run.completed',
      payload: {
        finishedAt: '2026-04-29T10:00:00.000Z',
      },
    })

    expect(on).toHaveBeenCalledWith(desktopBridgeChannels.runEvent, expect.any(Function))
    expect(listener).toHaveBeenCalledWith({
      id: 'event-1',
      runId: 'run-1',
      timestamp: '2026-04-29T10:00:00.000Z',
      type: 'run.completed',
      payload: {
        finishedAt: '2026-04-29T10:00:00.000Z',
      },
    })

    unsubscribe()

    expect(off).toHaveBeenCalledWith(desktopBridgeChannels.runEvent, expect.any(Function))
  })
})

async function loadDesktopApi() {
  await import('../../src/preload/index')
  return exposeInMainWorld.mock.calls[0][1] as DesktopApi
}
