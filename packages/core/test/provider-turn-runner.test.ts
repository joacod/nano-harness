import { describe, expect, it } from 'vitest'

import { createDefaultProviderSettings } from '@nano-harness/shared'

import { EmptySkillResolver, ProviderTurnRunner } from '../src'
import { createActionDefinition, createActionResult, defaultCredentialResolver, FakeActionExecutor, FakeProvider, FakeStore, testSettings } from './helpers'

const run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  role: 'plan',
  createdAt: '2026-04-29T10:00:00.000Z',
} as const

const messages = [{
  id: 'message-1',
  conversationId: 'conversation-1',
  runId: 'run-1',
  role: 'user',
  content: 'Inspect the repo.',
  createdAt: '2026-04-29T10:00:00.000Z',
}] as const

describe('ProviderTurnRunner', () => {
  it('runs provider turns with role-filtered actions, memory, auth, and stream callbacks', async () => {
    const store = new FakeStore()
    store.memoryRecords = [{
      id: 'memory-1',
      category: 'workflow',
      content: 'Run focused tests after edits.',
      source: 'USER.md',
      confidence: 1,
      createdAt: '2026-04-29T10:00:00.000Z',
      updatedAt: '2026-04-29T10:00:00.000Z',
    }]
    const provider = new FakeProvider([
      async (input) => {
        await input.onDelta?.('Hello ')
        await input.onDelta?.('world')
        await input.onReasoningDelta?.({ text: 'thinking' })
        return {}
      },
    ])
    const deltas: string[] = []
    const reasoningDeltas: string[] = []
    const runner = new ProviderTurnRunner({
      store,
      provider,
      providerCredentialResolver: defaultCredentialResolver,
      skillResolver: new EmptySkillResolver(),
      actionExecutor: new FakeActionExecutor([
        createActionDefinition({ id: 'read_file', title: 'Read File' }),
        createActionDefinition({ id: 'apply_patch', title: 'Apply Patch', requiresApproval: true }),
      ], async (input) => createActionResult({ actionCallId: input.call.id })),
      onDelta: async ({ delta }) => {
        deltas.push(delta)
      },
      onReasoningDelta: async ({ delta }) => {
        reasoningDeltas.push(delta.text ?? '')
      },
    })

    const result = await runner.run({
      run,
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    expect(result.streamedMessage).toBe('Hello world')
    expect(provider.calls[0].actions.map((action) => action.id)).toEqual(['read_file'])
    expect(provider.calls[0].providerAuth).toEqual({ authMethod: 'api-key', apiKey: 'test-api-key' })
    expect(provider.calls[0].memory?.selected.map((record) => record.id)).toEqual(['memory-1'])
    expect(deltas).toEqual(['Hello ', 'world'])
    expect(reasoningDeltas).toEqual(['thinking'])
  })

  it('fails before provider generation when required API key auth is missing', async () => {
    const provider = new FakeProvider([{ content: 'unused' }])
    const runner = new ProviderTurnRunner({
      store: new FakeStore(),
      provider,
      providerCredentialResolver: {
        async getProviderAuth() {
          return { authMethod: 'none' }
        },
      },
      skillResolver: new EmptySkillResolver(),
      actionExecutor: new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id })),
      onDelta: async () => {},
      onReasoningDelta: async () => {},
    })

    await expect(runner.run({
      run,
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })).rejects.toThrow('Missing API key for OpenRouter')
    expect(provider.calls).toHaveLength(0)
  })

  it('allows providers that do not require API key auth', async () => {
    const provider = new FakeProvider([{ content: 'Local response.' }])
    const runner = new ProviderTurnRunner({
      store: new FakeStore(),
      provider,
      providerCredentialResolver: {
        async getProviderAuth() {
          return { authMethod: 'none' }
        },
      },
      skillResolver: new EmptySkillResolver(),
      actionExecutor: new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id })),
      onDelta: async () => {},
      onReasoningDelta: async () => {},
    })

    await expect(runner.run({
      run: { ...run, role: 'build' },
      messages: [...messages],
      settings: {
        ...testSettings,
        provider: createDefaultProviderSettings('llama-cpp'),
      },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ providerResult: { content: 'Local response.' } })
    expect(provider.calls[0].providerAuth).toEqual({ authMethod: 'none' })
  })
})
