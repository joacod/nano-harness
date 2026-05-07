import { describe, expect, it } from 'vitest'

import type { ApprovalResolution, RunEvent } from '@nano-harness/shared'

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
