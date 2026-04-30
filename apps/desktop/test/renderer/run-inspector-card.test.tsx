// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalRequest, Run, RunEvent } from '@nano-harness/shared'

import type { StreamingRunState } from '../../src/renderer/utils/run-events'
import { RunInspectorCard } from '../../src/renderer/components/RunInspectorCard'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

describe('RunInspectorCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows an empty-state prompt when no run is selected', () => {
    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <RunInspectorCard run={null} events={[]} pendingApproval={null} streamingState={null} />,
    )

    expect(screen.getByText('Choose a run to inspect its persisted and live event sequence.')).toBeTruthy()
  })

  it('resumes and cancels recoverable runs through the desktop bridge', async () => {
    const user = userEvent.setup()
    const resumeRun = vi.fn(async () => undefined)
    const cancelRun = vi.fn(async () => undefined)

    window.desktop = createDesktopMock({ resumeRun, cancelRun })

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'started', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[event('provider.requested', { provider: 'OpenRouter', model: 'x-ai/grok-4.1-fast' })]}
        pendingApproval={null}
        streamingState={createStreamingState()}
      />,
    )

    expect(screen.getByText('streaming')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Resume run' }))
    await waitFor(() => {
      expect(resumeRun).toHaveBeenCalledWith({ runId: 'run-1' })
    })

    await user.click(screen.getByRole('button', { name: 'Cancel run' }))
    await waitFor(() => {
      expect(cancelRun).toHaveBeenCalledWith({ runId: 'run-1' })
    })
  })

  it('resolves pending approvals from the inspector', async () => {
    const user = userEvent.setup()
    const resolveApproval = vi.fn(async () => undefined)
    const pendingApproval = createApprovalRequest()

    window.desktop = createDesktopMock({ resolveApproval })

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'waiting_approval', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[event('approval.required', { approvalRequest: pendingApproval })]}
        pendingApproval={pendingApproval}
        streamingState={createStreamingState({ isStreaming: false, phase: 'waiting_approval' })}
      />,
    )

    expect(screen.getByText('Action requires confirmation')).toBeTruthy()
    expect(screen.getAllByText('Need approval to read notes.txt')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Grant approval' }))

    await waitFor(() => {
      expect(resolveApproval).toHaveBeenCalledWith({
        runId: 'run-1',
        approvalRequestId: 'approval-1',
        decision: 'granted',
      })
    })
  })

  it('surfaces mutation errors from run controls', async () => {
    const user = userEvent.setup()
    const cancelRun = vi.fn(async () => {
      throw new Error('Unable to cancel run')
    })

    window.desktop = createDesktopMock({ cancelRun })

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'started', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[]}
        pendingApproval={null}
        streamingState={createStreamingState({ isStreaming: false })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel run' }))

    expect(await screen.findByText('Unable to cancel run')).toBeTruthy()
  })
})

function createRun(overrides?: Partial<Run>): Run {
  return {
    id: 'run-1',
    conversationId: 'conversation-1',
    status: 'created',
    createdAt: '2026-04-29T10:00:00.000Z',
    ...overrides,
  }
}

function createApprovalRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'approval-1',
    runId: 'run-1',
    actionCallId: 'call-1',
    reason: 'Need approval to read notes.txt',
    requestedAt: '2026-04-29T10:02:00.000Z',
    ...overrides,
  }
}

function createStreamingState(overrides?: Partial<StreamingRunState>): StreamingRunState {
  return {
    conversationId: 'conversation-1',
    content: 'Hello world',
    reasoning: {
      text: '',
      summaries: [],
      encryptedCount: 0,
      isStreaming: false,
    },
    phase: 'streaming',
    activity: [],
    isStreaming: true,
    ...overrides,
  }
}

function event<T extends RunEvent['type']>(
  type: T,
  payload: Extract<RunEvent, { type: T }>['payload'],
): Extract<RunEvent, { type: T }> {
  return {
    id: `event-${type}`,
    runId: 'run-1',
    timestamp: '2026-04-29T10:03:00.000Z',
    type,
    payload,
  } as Extract<RunEvent, { type: T }>
}
