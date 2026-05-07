import { describe, expect, it } from 'vitest'

import type { ActionCall, ApprovalRequest, ApprovalResolution, Run, RunEvent, RunStatus } from '@nano-harness/shared'

import { ApprovalGate, ApprovalRejectedAbortError } from '../src'
import { FakeStore, testSettings } from './helpers'

const run: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  role: 'build',
  createdAt: '2026-04-29T10:00:00.000Z',
}

const actionCall: ActionCall = {
  id: 'action-call-1',
  runId: 'run-1',
  actionId: 'write_file',
  input: { path: 'notes.txt' },
  requestedAt: '2026-04-29T10:00:00.000Z',
}

describe('ApprovalGate', () => {
  it('creates approval requests, waits for decisions, and persists granted resolutions', async () => {
    const store = new FakeStore()
    const events: RunEvent[] = []
    const transitions: RunStatus[] = []
    const gate = new ApprovalGate({
      store,
      approvalCoordinator: {
        async waitForDecision(input: { request: ApprovalRequest }): Promise<ApprovalResolution> {
          return {
            approvalRequestId: input.request.id,
            decision: 'granted',
            decidedAt: '2026-04-29T10:00:05.000Z',
          }
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async (event) => {
        events.push(event)
      },
      transitionRun: async (currentRun, nextStatus) => {
        transitions.push(nextStatus)
        return { ...currentRun, status: nextStatus }
      },
      cancelRun: async () => {},
    })

    await expect(gate.requestApproval({
      run,
      actionCall,
      reason: 'Review write.',
      settings: testSettings,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ decision: 'granted' })

    expect(store.approvalRequests).toEqual([expect.objectContaining({ actionCallId: actionCall.id, reason: 'Review write.' })])
    expect(store.approvalResolutions).toEqual([expect.objectContaining({ decision: 'granted' })])
    expect(transitions).toEqual(['waiting_approval', 'started'])
    expect(events.map((event) => event.type)).toEqual(['approval.required', 'approval.granted'])
  })

  it('cancels and aborts when resuming a rejected pending approval', async () => {
    const store = new FakeStore()
    let cancelReason = ''
    const gate = new ApprovalGate({
      store,
      now: () => '2026-04-29T10:00:00.000Z',
      createId: createSequentialId(),
      emitEvent: async () => {},
      transitionRun: async (currentRun, nextStatus) => ({ ...currentRun, status: nextStatus }),
      cancelRun: async (_run, reason) => {
        cancelReason = reason
      },
    })

    await expect(gate.resumeFromPendingApproval({
      run,
      pendingApproval: {
        request: {
          id: 'approval-1',
          runId: run.id,
          actionCallId: actionCall.id,
          reason: 'Review write.',
          requestedAt: '2026-04-29T10:00:00.000Z',
        },
        actionCall,
      },
      settings: testSettings,
      approvalResolutions: [{
        approvalRequestId: 'approval-1',
        decision: 'rejected',
        decidedAt: '2026-04-29T10:00:05.000Z',
      }],
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(ApprovalRejectedAbortError)

    expect(cancelReason).toBe('approval rejected for write_file')
  })
})

function createSequentialId(): () => string {
  let id = 0

  return () => {
    id += 1
    return `id-${id}`
  }
}
