import { describe, expect, it } from 'vitest'

import type { ApprovalResolution, RunEvent } from '@nano-harness/shared'
import { runEventSchema } from '@nano-harness/shared'

import { ActionInvocationPipeline } from '../src'
import { createActionDefinition, createActionResult, createToolRequest, FakeActionExecutor, FakePolicy, FakeStore, testSettings } from './helpers'

const run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  role: 'build',
  createdAt: '2026-04-29T10:00:00.000Z',
} as const

const messages = [{
  id: 'message-1',
  conversationId: 'conversation-1',
  runId: 'run-1',
  role: 'user',
  content: 'Read notes.txt.',
  createdAt: '2026-04-29T10:00:00.000Z',
}] as const

describe('ActionInvocationPipeline', () => {
  it('executes allowed actions, runs hooks, and persists tool messages', async () => {
    const store = new FakeStore()
    const events: RunEvent[] = []
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'read_file', title: 'Read File' }),
    ], async (input) => createActionResult({ actionCallId: input.call.id, output: { content: 'hello' } }))
    const pipeline = new ActionInvocationPipeline({
      store,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      hookRunner: {
        async listHooks() {
          return ['test.pre_tool_use', 'test.post_tool_use']
        },
        async runHooks(input) {
          return [{ hookId: `test.${input.phase}`, phase: input.phase, status: 'completed', message: 'ok' }]
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
      },
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    const result = await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('read_file')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    expect(result.stopped).toBe(false)
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'tool'])
    expect(store.messages[0]).toMatchObject({ role: 'tool', content: '{\n  "content": "hello"\n}' })
    expect(actionExecutor.executions).toHaveLength(1)
    expect(events.map((event) => event.type)).toEqual([
      'action.requested',
      'hook.started',
      'hook.completed',
      'action.started',
      'action.completed',
      'hook.started',
      'hook.completed',
      'message.created',
    ])
  })

  it('stops without executing actions when approval is rejected', async () => {
    const store = new FakeStore()
    let cancelReason = ''
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true }),
    ], async (input) => createActionResult({ actionCallId: input.call.id }))
    const pipeline = new ActionInvocationPipeline({
      store,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'require_approval', reason: 'Review write.' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async () => {},
      requireApproval: async (): Promise<ApprovalResolution> => ({
        approvalRequestId: 'approval-1',
        decision: 'rejected',
        decidedAt: '2026-04-29T10:00:00.000Z',
      }),
      cancelRun: async (_run, reason) => {
        cancelReason = reason
      },
    })

    const result = await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('write_file')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    expect(result).toEqual({ messages: [...messages], stopped: true })
    expect(actionExecutor.executions).toHaveLength(0)
    expect(store.messages).toHaveLength(0)
    expect(cancelReason).toBe('approval rejected for write_file')
  })

  it('emits validation obligations after file edits', async () => {
    const events: RunEvent[] = []
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true }),
    ], async (input) => createActionResult({ actionCallId: input.call.id, output: { path: 'src/app.ts', bytesWritten: 42 } }))
    const pipeline = new ActionInvocationPipeline({
      store: new FakeStore(),
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
      },
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('write_file')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    const obligationEvent = events.find((event) => event.type === 'obligation.created')
    expect(obligationEvent).toMatchObject({
      type: 'obligation.created',
      payload: {
        obligation: {
          reason: 'Validate edits to src/app.ts.',
          sourceActionCallIds: ['id-1'],
          changedFiles: ['src/app.ts'],
          validationCommands: [],
        },
      },
    })
  })

  it('satisfies open validation obligations after successful validation commands', async () => {
    const store = new FakeStore()
    const events: RunEvent[] = []
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true }),
      createActionDefinition({ id: 'run_command', title: 'Run Command', requiresApproval: true }),
    ], async (input) => {
      if (input.call.actionId === 'write_file') {
        return createActionResult({ actionCallId: input.call.id, output: { path: 'src/app.ts', bytesWritten: 42 } })
      }

      return createActionResult({
        actionCallId: input.call.id,
        output: { command: 'pnpm', args: ['typecheck'], exitCode: 0, stdout: 'ok', stderr: '' },
      })
    })
    const pipeline = new ActionInvocationPipeline({
      store,
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
        await store.appendEvent(event)
      },
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('write_file'), createToolRequest('run_command')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    const obligationEvent = events.find((event) => event.type === 'obligation.created')
    const runCommandEvent = events.find((event): event is Extract<RunEvent, { type: 'action.requested' }> =>
      event.type === 'action.requested' && event.payload.actionCall.actionId === 'run_command')
    expect(events.find((event) => event.type === 'obligation.satisfied')).toMatchObject({
      type: 'obligation.satisfied',
      payload: {
        obligationId: obligationEvent?.payload.obligation.id,
        evidence: expect.arrayContaining([`action:run_command:${runCommandEvent?.payload.actionCall.id}`, 'command:pnpm typecheck']),
      },
    })
  })

  it('emits spec artifact and validation obligation events after spec writes', async () => {
    const events: RunEvent[] = []
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'write_spec_artifact', title: 'Write Spec Artifact', requiresApproval: true }),
    ], async (input) => createActionResult({
      actionCallId: input.call.id,
      output: {
        changeId: 'add-workbench',
        changeCreated: true,
        change: {
          id: 'add-workbench',
          title: 'Add Workbench',
          status: 'draft',
          path: '.nano/specs/changes/add-workbench',
          taskCounts: { total: 1, todo: 1, inProgress: 0, done: 0, blocked: 0 },
          updatedAt: '2026-04-29T10:00:00.000Z',
          linkedRunIds: [],
        },
        artifactKind: 'tasks',
        path: '.nano/specs/changes/add-workbench/tasks.md',
        bytesWritten: 17,
      },
    }))
    const pipeline = new ActionInvocationPipeline({
      store: new FakeStore(),
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
      },
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('write_spec_artifact')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    const changeCreatedEvent = events.find((event) => event.type === 'spec.change_created')
    const artifactWrittenEvent = events.find((event) => event.type === 'spec.artifact_written')

    expect(changeCreatedEvent).toMatchObject({
      type: 'spec.change_created',
      payload: {
        change: {
          id: 'add-workbench',
          path: '.nano/specs/changes/add-workbench',
        },
      },
    })
    expect(runEventSchema.parse(changeCreatedEvent)).toMatchObject({ type: 'spec.change_created' })
    expect(events.indexOf(changeCreatedEvent as RunEvent)).toBeLessThan(events.indexOf(artifactWrittenEvent as RunEvent))
    expect(artifactWrittenEvent).toMatchObject({
      type: 'spec.artifact_written',
      payload: {
        changeId: 'add-workbench',
        artifactKind: 'tasks',
        path: '.nano/specs/changes/add-workbench/tasks.md',
      },
    })
    expect(events.find((event) => event.type === 'obligation.created')).toMatchObject({
      type: 'obligation.created',
      payload: {
        obligation: {
          reason: 'Validate spec artifact tasks for add-workbench.',
          changedFiles: ['.nano/specs/changes/add-workbench/tasks.md'],
        },
      },
    })
  })

  it('emits current spec paths when spec changes are archived', async () => {
    const events: RunEvent[] = []
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'archive_spec_change', title: 'Archive Spec Change', requiresApproval: true }),
    ], async (input) => createActionResult({
      actionCallId: input.call.id,
      output: {
        changeId: 'add-workbench',
        archivedPath: '.nano/specs/archive/add-workbench',
        currentSpecPaths: ['.nano/specs/current/ui/spec.md'],
      },
    }))
    const pipeline = new ActionInvocationPipeline({
      store: new FakeStore(),
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'allow' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
      },
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    await pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('archive_spec_change')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })

    expect(events.find((event) => event.type === 'spec.change_archived')).toMatchObject({
      type: 'spec.change_archived',
      payload: {
        changeId: 'add-workbench',
        archivedPath: '.nano/specs/archive/add-workbench',
        currentSpecPaths: ['.nano/specs/current/ui/spec.md'],
      },
    })
  })

  it('denies actions before execution when policy rejects them', async () => {
    const actionExecutor = new FakeActionExecutor([
      createActionDefinition({ id: 'read_file', title: 'Read File' }),
    ], async (input) => createActionResult({ actionCallId: input.call.id }))
    const pipeline = new ActionInvocationPipeline({
      store: new FakeStore(),
      actionExecutor,
      policy: new FakePolicy(() => ({ effect: 'deny', reason: 'Denied by test.' })),
      hookRunner: {
        async listHooks() {
          return []
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async () => {},
      requireApproval: async () => ({ approvalRequestId: 'unused', decision: 'granted', decidedAt: '2026-04-29T10:00:00.000Z' }),
      cancelRun: async () => {},
    })

    await expect(pipeline.executeRequests({
      run,
      actionRequests: [createToolRequest('read_file')],
      messages: [...messages],
      settings: testSettings,
      signal: new AbortController().signal,
    })).rejects.toThrow('Denied by test.')
    expect(actionExecutor.executions).toHaveLength(0)
  })
})

function createSequentialId(): () => string {
  let id = 0

  return () => {
    id += 1
    return `id-${id}`
  }
}
