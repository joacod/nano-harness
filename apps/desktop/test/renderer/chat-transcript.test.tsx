// @vitest-environment jsdom

import { createRef } from 'react'

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalRequest, ConversationSnapshot } from '@nano-harness/shared'

import { ChatTranscript } from '../../src/renderer/components/ChatTranscript'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

describe('ChatTranscript', () => {
  afterEach(() => {
    cleanup()
  })

  it('resolves pending approvals from the chat transcript', async () => {
    const user = userEvent.setup()
    const resolveApproval = vi.fn(async () => undefined)
    const pendingApproval = createApprovalRequest()

    window.desktop = createDesktopMock({ resolveApproval })

    renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot({ approvalRequests: [pendingApproval] })}
        streamingEntry={null}
        pendingApproval={pendingApproval}
        endRef={createRef<HTMLDivElement>()}
      />,
    )

    expect(screen.getByText('Confirm to continue')).toBeTruthy()
    expect(screen.getByText('Need approval to read notes.txt')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Grant approval' }))

    await waitFor(() => {
      expect(resolveApproval).toHaveBeenCalledWith({
        runId: 'run-1',
        approvalRequestId: 'approval-1',
        decision: 'granted',
      })
    })
  })
})

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

function createSnapshot(overrides?: Partial<ConversationSnapshot>): ConversationSnapshot {
  return {
    conversation: null,
    runs: [],
    messages: [],
    events: [],
    approvalRequests: [],
    approvalResolutions: [],
    ...overrides,
  }
}
