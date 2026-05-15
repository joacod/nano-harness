// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerDefaultModels, type ApprovalRequest, type Run, type RunEvent } from '@nano-harness/shared'

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
      <RunInspectorCard
        run={null}
        events={[]}
        pendingApproval={null}
        streamingState={null}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
      />,
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
        events={[event('provider.requested', { provider: 'OpenRouter', model: providerDefaultModels.openrouter })]}
        pendingApproval={null}
        streamingState={createStreamingState()}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
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

  it('shows waiting approval status without approval actions', () => {
    const resolveApproval = vi.fn(async () => undefined)
    const pendingApproval = createApprovalRequest()

    window.desktop = createDesktopMock({ resolveApproval })

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'waiting_approval', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[event('approval.required', { approvalRequest: pendingApproval })]}
        pendingApproval={pendingApproval}
        streamingState={createStreamingState({ isStreaming: false, phase: 'waiting_approval' })}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
      />,
    )

    expect(screen.getByText('waiting_approval')).toBeTruthy()
    expect(screen.getByText('Approval required')).toBeTruthy()
    expect(screen.getByText('Need approval to read notes.txt')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Grant approval' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
    expect(resolveApproval).not.toHaveBeenCalled()
  })

  it('shows signal trace events latest first', () => {
    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'completed', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[
          event('run.started', { startedAt: '2026-04-29T10:01:00.000Z' }, 'event-started', '2026-04-29T10:01:00.000Z'),
          event('provider.completed', { messageId: 'message-1' }, 'event-completed', '2026-04-29T10:03:00.000Z'),
        ]}
        pendingApproval={null}
        streamingState={null}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
      />,
    )

    const items = within(screen.getByRole('list', { name: 'Signal trace, latest first' })).getAllByRole('listitem')
    expect(items[0].textContent).toContain('Provider stream completed')
    expect(items[1].textContent).toContain('Run started')
  })

  it('links spec workflow events back to the workbench', () => {
    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'completed', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[
          event('spec.artifact_written', {
            changeId: 'add-spec-workbench',
            artifactKind: 'proposal',
            path: '.nano/specs/changes/add-spec-workbench/proposal.md',
          }),
        ]}
        pendingApproval={null}
        streamingState={null}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
      />,
    )

    expect(screen.getByRole('link', { name: 'Open in Specs' }).getAttribute('href')).toBe('/specs/add-spec-workbench')
  })

  it('shows recalled memory and pending suggestions in the inspector', () => {
    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <RunInspectorCard
        run={createRun({ status: 'completed', startedAt: '2026-04-29T10:01:00.000Z' })}
        events={[]}
        pendingApproval={null}
        streamingState={null}
        memoryRecords={{
          records: [{
            id: 'memory-1',
            category: 'workflow',
            content: 'Run typecheck after renderer edits.',
            source: 'proposal:proposal-1',
            runId: 'run-1',
            confidence: 0.8,
            createdAt: '2026-04-29T10:00:00.000Z',
            updatedAt: '2026-04-29T10:05:00.000Z',
          }],
        }}
        memoryProposals={{
          proposals: [{
            id: 'proposal-2',
            runId: 'run-1',
            category: 'workflow',
            content: 'Validate spec tasks before marking them done.',
            rationale: 'Spec evidence was appended during this run.',
            evidence: ['validation:pnpm typecheck passed'],
            status: 'pending',
            createdAt: '2026-04-29T10:06:00.000Z',
          }],
        }}
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
      />,
    )

    expect(screen.getByText('Memory')).toBeTruthy()
    expect(screen.getByText('Run typecheck after renderer edits.')).toBeTruthy()
    expect(screen.getByText('Validate spec tasks before marking them done.')).toBeTruthy()
    expect(screen.getByText('Evidence: validation:pnpm typecheck passed')).toBeTruthy()
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
        onEvidenceExported={() => undefined}
        onEvidenceExportError={() => undefined}
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
    role: 'build',
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
  id = `event-${type}`,
  timestamp = '2026-04-29T10:03:00.000Z',
): Extract<RunEvent, { type: T }> {
  return {
    id,
    runId: 'run-1',
    timestamp,
    type,
    payload,
  } as Extract<RunEvent, { type: T }>
}
