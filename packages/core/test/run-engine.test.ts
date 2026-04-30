import { describe, expect, it } from 'vitest'

import { CoreRunEngine } from '../src'
import {
  createActionDefinition,
  createActionResult,
  createBlockingProviderStep,
  createRunInput,
  createToolRequest,
  defaultCredentialResolver,
  FakeActionExecutor,
  FakePolicy,
  FakeProvider,
  FakeStore,
  ManualApprovalCoordinator,
  RecordingEventBus,
  testSettings,
  waitForCondition,
} from './helpers'

describe('CoreRunEngine', () => {
  it('completes a basic provider-only run and persists the expected events', async () => {
    const store = new FakeStore()
    const provider = new FakeProvider([{ content: 'Summary ready.' }])
    const eventBus = new RecordingEventBus()
    const actionExecutor = new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id }))
    const engine = new CoreRunEngine({
      store,
      provider,
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      eventBus,
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput({ prompt: 'Summarize the latest run.' }))

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'completed')

    expect(store.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(store.messages[1]).toMatchObject({ content: 'Summary ready.' })
    expect(store.events.map((event) => event.type)).toEqual([
      'run.created',
      'message.created',
      'run.started',
      'provider.requested',
      'message.created',
      'provider.completed',
      'run.completed',
    ])
    expect(eventBus.published.map((event) => event.type)).toEqual(store.events.map((event) => event.type))
  })

  it('fails a run when the provider api key is missing', async () => {
    const store = new FakeStore()
    const engine = new CoreRunEngine({
      store,
      provider: new FakeProvider([{ content: 'unused' }]),
      providerCredentialResolver: {
        async getProviderAuth() {
          return { authMethod: 'none' }
        },
      },
      actionExecutor: new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id })),
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'failed')

    expect(store.runs.get(handle.runId)).toMatchObject({
      status: 'failed',
      failureMessage: 'Missing API key for OpenRouter',
    })
    expect(store.events.map((event) => event.type)).toContain('provider.error')
  })

  it('allows providers that do not require an api key', async () => {
    const store = new FakeStore()
    store.settings = {
      ...testSettings,
      provider: {
        provider: 'llama-cpp',
        model: 'local-model',
        baseUrl: 'http://127.0.0.1:8080/v1',
      },
    }
    const provider = new FakeProvider([{ content: 'Local response.' }])
    const engine = new CoreRunEngine({
      store,
      provider,
      providerCredentialResolver: {
        async getProviderAuth() {
          return { authMethod: 'none' }
        },
      },
      actionExecutor: new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id })),
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'completed')

    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0].providerAuth).toEqual({ authMethod: 'none' })
    expect(store.messages[1]).toMatchObject({ content: 'Local response.' })
  })

  it('executes tool calls, persists tool output, and continues the provider loop', async () => {
    const store = new FakeStore()
    const readFileAction = createActionDefinition({ id: 'read_file', title: 'Read File' })
    const provider = new FakeProvider([
      {
        content: 'Checking the file.',
        actionCalls: [createToolRequest('read_file', 'tool-call-1')],
      },
      {
        content: 'The file says hello.',
      },
    ])
    const actionExecutor = new FakeActionExecutor([readFileAction], async (input) =>
      createActionResult({
        actionCallId: input.call.id,
        output: { path: 'notes.txt', content: 'hello' },
      }),
    )
    const engine = new CoreRunEngine({
      store,
      provider,
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'completed')

    expect(provider.calls).toHaveLength(2)
    expect(actionExecutor.executions).toHaveLength(1)
    expect(store.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(store.messages[1]).toMatchObject({
      toolCalls: [{ actionId: 'read_file' }],
    })
    expect(store.messages[2]).toMatchObject({
      role: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
    })
  })

  it('fails a run when policy denies an action', async () => {
    const store = new FakeStore()
    const writeFileAction = createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true })
    const actionExecutor = new FakeActionExecutor([writeFileAction], async (input) =>
      createActionResult({ actionCallId: input.call.id, output: { ok: true } }),
    )
    const engine = new CoreRunEngine({
      store,
      provider: new FakeProvider([{ actionCalls: [createToolRequest('write_file')] }]),
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'deny', reason: 'Writes are blocked in this workspace' })),
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'failed')

    expect(actionExecutor.executions).toHaveLength(0)
    expect(store.runs.get(handle.runId)?.failureMessage).toBe('Writes are blocked in this workspace')
    expect(store.events.map((event) => event.type)).not.toContain('action.started')
  })

  it('resumes after approval is granted and completes the action flow', async () => {
    const store = new FakeStore()
    store.settings = {
      ...testSettings,
      workspace: {
        ...testSettings.workspace,
        approvalPolicy: 'always',
      },
    }
    const approvalCoordinator = new ManualApprovalCoordinator()
    const writeFileAction = createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true })
    const engine = new CoreRunEngine({
      store,
      provider: new FakeProvider([{ actionCalls: [createToolRequest('write_file')] }, { content: 'Write completed.' }]),
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor: new FakeActionExecutor([writeFileAction], async (input) =>
        createActionResult({ actionCallId: input.call.id, output: { bytesWritten: 12 } }),
      ),
      policy: new FakePolicy(() => ({ effect: 'require_approval', reason: 'User approval required' })),
      approvalCoordinator,
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'waiting_approval')
    expect(store.approvalRequests).toHaveLength(1)

    await engine.resolveApproval({
      runId: handle.runId,
      approvalRequestId: store.approvalRequests[0].id,
      decision: 'granted',
    })

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'completed')

    expect(store.approvalResolutions).toEqual([
      {
        approvalRequestId: store.approvalRequests[0].id,
        decision: 'granted',
        decidedAt: '2026-04-29T10:00:05.000Z',
      },
    ])
    expect(store.events.map((event) => event.type)).toContain('approval.granted')
  })

  it('cancels the run when approval is rejected', async () => {
    const store = new FakeStore()
    store.settings = {
      ...testSettings,
      workspace: {
        ...testSettings.workspace,
        approvalPolicy: 'always',
      },
    }
    const approvalCoordinator = new ManualApprovalCoordinator()
    const writeFileAction = createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true })
    const actionExecutor = new FakeActionExecutor([writeFileAction], async (input) =>
      createActionResult({ actionCallId: input.call.id, output: { bytesWritten: 12 } }),
    )
    const engine = new CoreRunEngine({
      store,
      provider: new FakeProvider([{ actionCalls: [createToolRequest('write_file')] }]),
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'require_approval', reason: 'User approval required' })),
      approvalCoordinator,
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'waiting_approval')

    await engine.resolveApproval({
      runId: handle.runId,
      approvalRequestId: store.approvalRequests[0].id,
      decision: 'rejected',
    })

    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'cancelled')

    expect(actionExecutor.executions).toHaveLength(0)
    expect(store.events.map((event) => event.type)).toContain('approval.rejected')
  })

  it('cancels an active run when the caller aborts it', async () => {
    const store = new FakeStore()
    const engine = new CoreRunEngine({
      store,
      provider: new FakeProvider([createBlockingProviderStep()]),
      providerCredentialResolver: defaultCredentialResolver,
      actionExecutor: new FakeActionExecutor([], async (input) => createActionResult({ actionCallId: input.call.id })),
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
    })

    const handle = await engine.startRun(createRunInput())

    await waitForCondition(() => store.events.some((event) => event.type === 'provider.requested'))
    await handle.cancel()
    await waitForCondition(() => store.runs.get(handle.runId)?.status === 'cancelled')

    expect(store.events.map((event) => event.type)).toContain('run.cancelled')
  })
})

function createSequentialId() {
  let value = 0

  return () => {
    value += 1
    return `id-${value}`
  }
}
