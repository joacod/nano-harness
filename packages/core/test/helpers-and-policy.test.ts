import { describe, expect, it } from 'vitest'

import type { ConversationSnapshot, RunEvent } from '@nano-harness/shared'

import { getLatestPendingApproval, InMemoryEventBus, isTerminalStatus, StaticPolicy } from '../src'
import { assertStatusTransition } from '../src/run-status'
import { createActionDefinition, testSettings } from './helpers'

describe('core helpers and policy', () => {
  it('allows valid run status transitions and rejects invalid ones', () => {
    expect(() => assertStatusTransition('created', 'started')).not.toThrow()
    expect(() => assertStatusTransition('started', 'completed')).not.toThrow()
    expect(() => assertStatusTransition('completed', 'started')).toThrow(
      'Invalid run status transition from completed to started',
    )
  })

  it('identifies terminal run states', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('waiting_approval')).toBe(false)
  })

  it('evaluates static policy for always, on-request, and never approval modes', async () => {
    const policy = new StaticPolicy()
    const writeAction = createActionDefinition({ id: 'write_file', title: 'Write File', requiresApproval: true })
    const readAction = createActionDefinition({ id: 'read_file', title: 'Read File', requiresApproval: false })
    const baseInput = {
      run: {
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'started' as const,
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      actionCall: {
        id: 'call-1',
        runId: 'run-1',
        actionId: 'read_file',
        input: {},
        requestedAt: '2026-04-29T10:00:00.000Z',
      },
      settings: testSettings,
    }

    await expect(
      policy.evaluateAction({
        ...baseInput,
        action: readAction,
        settings: { ...testSettings, workspace: { ...testSettings.workspace, approvalPolicy: 'always' } },
      }),
    ).resolves.toMatchObject({ effect: 'require_approval' })

    await expect(
      policy.evaluateAction({
        ...baseInput,
        action: readAction,
        settings: { ...testSettings, workspace: { ...testSettings.workspace, approvalPolicy: 'on-request' } },
      }),
    ).resolves.toMatchObject({ effect: 'allow' })

    await expect(
      policy.evaluateAction({
        ...baseInput,
        action: writeAction,
        settings: { ...testSettings, workspace: { ...testSettings.workspace, approvalPolicy: 'never' } },
      }),
    ).resolves.toMatchObject({ effect: 'deny' })
  })

  it('returns the latest unresolved approval with its requested action', () => {
    const snapshot: ConversationSnapshot = {
      conversation: null,
      runs: [],
      messages: [],
      events: [
        {
          id: 'event-1',
          runId: 'run-1',
          timestamp: '2026-04-29T10:00:00.000Z',
          type: 'action.requested',
          payload: {
            actionCall: {
              id: 'call-1',
              runId: 'run-1',
              actionId: 'write_file',
              input: { path: 'a.txt' },
              requestedAt: '2026-04-29T10:00:00.000Z',
            },
          },
        },
        {
          id: 'event-2',
          runId: 'run-1',
          timestamp: '2026-04-29T10:00:01.000Z',
          type: 'action.requested',
          payload: {
            actionCall: {
              id: 'call-2',
              runId: 'run-1',
              actionId: 'write_file',
              input: { path: 'b.txt' },
              requestedAt: '2026-04-29T10:00:01.000Z',
            },
          },
        },
      ],
      approvalRequests: [
        {
          id: 'approval-1',
          runId: 'run-1',
          actionCallId: 'call-1',
          reason: 'first',
          requestedAt: '2026-04-29T10:00:00.500Z',
        },
        {
          id: 'approval-2',
          runId: 'run-1',
          actionCallId: 'call-2',
          reason: 'second',
          requestedAt: '2026-04-29T10:00:01.500Z',
        },
      ],
      approvalResolutions: [
        {
          approvalRequestId: 'approval-1',
          decision: 'granted',
          decidedAt: '2026-04-29T10:00:00.800Z',
        },
      ],
    }

    expect(getLatestPendingApproval(snapshot)).toMatchObject({
      request: { id: 'approval-2' },
      actionCall: { id: 'call-2' },
    })
  })

  it('throws when a pending approval has no matching action.requested event', () => {
    const snapshot: ConversationSnapshot = {
      conversation: null,
      runs: [],
      messages: [],
      events: [],
      approvalRequests: [
        {
          id: 'approval-1',
          runId: 'run-1',
          actionCallId: 'call-1',
          reason: 'Need approval',
          requestedAt: '2026-04-29T10:00:00.000Z',
        },
      ],
      approvalResolutions: [],
    }

    expect(() => getLatestPendingApproval(snapshot)).toThrow(
      'Missing action.requested event for approval request approval-1',
    )
  })

  it('publishes events in order and stops after unsubscribe', async () => {
    const bus = new InMemoryEventBus()
    const received: RunEvent[] = []
    const unsubscribe = bus.subscribe((event) => {
      received.push(event)
    })

    const firstEvent: RunEvent = {
      id: 'event-1',
      runId: 'run-1',
      timestamp: '2026-04-29T10:00:00.000Z',
      type: 'run.created',
      payload: {
        run: {
          id: 'run-1',
          conversationId: 'conversation-1',
          status: 'created',
          createdAt: '2026-04-29T10:00:00.000Z',
        },
      },
    }
    const secondEvent: RunEvent = {
      id: 'event-2',
      runId: 'run-1',
      timestamp: '2026-04-29T10:00:01.000Z',
      type: 'run.completed',
      payload: {
        finishedAt: '2026-04-29T10:00:01.000Z',
      },
    }

    await bus.publish(firstEvent)
    unsubscribe()
    await bus.publish(secondEvent)

    expect(received).toEqual([firstEvent])
  })
})
