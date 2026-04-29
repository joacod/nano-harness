import { describe, expect, it } from 'vitest'

import type { AppSettings, ConversationSnapshot, RunEvent } from '@nano-harness/shared'

import {
  applyProviderDefaults,
  getEventFamily,
  getPendingApproval,
  getProviderRequestForRun,
  getRecoverableRunAction,
  mergeRunEvents,
  updateLiveRunEvents,
  updateStreamingState,
} from '../../src/renderer/utils/run-events'

describe('renderer run-events utilities', () => {
  it('creates streaming state for new runs and updates phase, content, reasoning, and errors', () => {
    const created = event('run.created', {
      run: {
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'created',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
    })

    let state = updateStreamingState({}, created)
    expect(state['run-1']).toMatchObject({
      conversationId: 'conversation-1',
      phase: 'queued',
      content: '',
      isStreaming: false,
    })

    state = updateStreamingState(
      state,
      event('provider.requested', {
        provider: 'OpenRouter',
        model: 'x-ai/grok-4.1-fast',
      }),
    )
    expect(state['run-1'].phase).toBe('contacting_provider')

    state = updateStreamingState(state, event('provider.delta', { delta: 'Hello ' }))
    state = updateStreamingState(state, event('provider.delta', { delta: 'world' }))
    expect(state['run-1']).toMatchObject({
      content: 'Hello world',
      phase: 'streaming',
      isStreaming: true,
    })

    state = updateStreamingState(
      state,
      event('provider.reasoning_delta', {
        text: 'thinking ',
        details: [
          { type: 'reasoning.text', text: 'step 1' },
          { type: 'reasoning.summary', summary: 'summary 1' },
          { type: 'reasoning.encrypted', data: 'secret' },
          { type: 'reasoning.unknown', data: { raw: true } },
        ],
      }),
    )
    expect(state['run-1'].reasoning).toMatchObject({
      text: 'thinking step 1',
      summaries: ['summary 1'],
      encryptedCount: 2,
      isStreaming: true,
    })

    state = updateStreamingState(state, event('provider.error', { message: 'Provider failed' }))
    expect(state['run-1']).toMatchObject({
      isStreaming: false,
      errorMessage: 'Provider failed',
    })

    state = updateStreamingState(state, event('run.failed', { message: 'Provider failed' }))
    expect(state['run-1']).toBeUndefined()
  })

  it('switches to tool and approval phases and keeps only the last three activities', () => {
    const created = updateStreamingState(
      {},
      event('run.created', {
        run: {
          id: 'run-1',
          conversationId: 'conversation-1',
          status: 'created',
          createdAt: '2026-04-29T10:00:00.000Z',
        },
      }),
    )

    let state = updateStreamingState(created, event('action.requested', {
      actionCall: {
        id: 'call-1',
        runId: 'run-1',
        actionId: 'read_file',
        input: { path: 'notes.txt' },
        requestedAt: '2026-04-29T10:00:01.000Z',
      },
    }))
    state = updateStreamingState(state, event('action.started', { actionCallId: 'call-1' }))
    state = updateStreamingState(state, event('approval.required', {
      approvalRequest: {
        id: 'approval-1',
        runId: 'run-1',
        actionCallId: 'call-1',
        reason: 'Need approval',
        requestedAt: '2026-04-29T10:00:02.000Z',
      },
    }))

    expect(state['run-1'].phase).toBe('waiting_approval')
    expect(state['run-1'].activity).toHaveLength(3)
    expect(state['run-1'].activity.at(-1)).toMatchObject({
      title: 'Approval required',
      detail: 'Need approval',
    })
  })

  it('caps live run events at 200 and merges persisted and live events by id', () => {
    let current: Record<string, RunEvent[]> = {}

    for (let index = 0; index < 205; index += 1) {
      current = updateLiveRunEvents(current, {
        id: `event-${index}`,
        runId: 'run-1',
        timestamp: `2026-04-29T10:00:${String(index).padStart(2, '0')}.000Z`,
        type: 'provider.delta',
        payload: { delta: String(index) },
      })
    }

    expect(current['run-1']).toHaveLength(200)
    expect(current['run-1'][0]?.id).toBe('event-5')

    const merged = mergeRunEvents(
      [
        event('provider.requested', { provider: 'OpenRouter', model: 'x-ai/grok-4.1-fast' }, 'event-a', '2026-04-29T10:00:00.000Z'),
        event('provider.delta', { delta: 'old' }, 'shared-id', '2026-04-29T10:00:01.000Z'),
      ],
      [
        event('provider.delta', { delta: 'new' }, 'shared-id', '2026-04-29T10:00:02.000Z'),
        event('provider.completed', { messageId: 'message-1' }, 'event-b', '2026-04-29T10:00:03.000Z'),
      ],
    )

    expect(merged).toHaveLength(3)
    expect(merged.map((item) => item.id)).toEqual(['event-a', 'shared-id', 'event-b'])
    expect(merged[1]).toMatchObject({ payload: { delta: 'new' } })
  })

  it('returns selectors and defaults for approvals, provider requests, and event families', () => {
    const snapshot: ConversationSnapshot = {
      conversation: null,
      runs: [
        {
          id: 'run-1',
          conversationId: 'conversation-1',
          status: 'waiting_approval',
          createdAt: '2026-04-29T10:00:00.000Z',
        },
      ],
      messages: [],
      events: [event('provider.requested', { provider: 'OpenRouter', model: 'x-ai/grok-4.1-fast' })],
      approvalRequests: [
        {
          id: 'approval-1',
          runId: 'run-1',
          actionCallId: 'call-1',
          reason: 'Need approval',
          requestedAt: '2026-04-29T10:00:01.000Z',
        },
      ],
      approvalResolutions: [],
    }

    expect(getPendingApproval(snapshot, 'run-1')).toMatchObject({ id: 'approval-1' })
    expect(getPendingApproval(snapshot, null)).toBeNull()
    expect(getRecoverableRunAction(snapshot.runs[0], snapshot.approvalRequests[0])).toBeNull()
    expect(getRecoverableRunAction({ ...snapshot.runs[0], status: 'started' }, null)).toBe('resume')
    expect(getProviderRequestForRun(snapshot.events, 'run-1')).toMatchObject({ type: 'provider.requested' })
    expect(getEventFamily('provider.reasoning_delta')).toBe('provider')
  })

  it('applies provider defaults without changing workspace settings', () => {
    const settings: AppSettings = {
      provider: {
        provider: 'openrouter',
        model: 'custom/model',
        reasoning: { mode: 'off' },
      },
      workspace: {
        rootPath: '/workspace',
        approvalPolicy: 'always',
      },
    }

    expect(applyProviderDefaults(settings, 'openrouter')).toEqual({
      provider: {
        provider: 'openrouter',
        model: 'x-ai/grok-4.1-fast',
        reasoning: { mode: 'off' },
      },
      workspace: {
        rootPath: '/workspace',
        approvalPolicy: 'always',
      },
    })
  })
})

function event<T extends RunEvent['type']>(
  type: T,
  payload: Extract<RunEvent, { type: T }>['payload'],
  id = 'event-1',
  timestamp = '2026-04-29T10:00:00.000Z',
): Extract<RunEvent, { type: T }> {
  return {
    id,
    runId: 'run-1',
    timestamp,
    type,
    payload,
  } as Extract<RunEvent, { type: T }>
}
