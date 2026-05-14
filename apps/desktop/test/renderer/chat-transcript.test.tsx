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

  it('hides persisted tool activity when advanced chat activity is disabled', () => {
    renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot({ messages: createToolActivityMessages() })}
        streamingEntry={null}
        pendingApproval={null}
        endRef={createRef<HTMLDivElement>()}
        showAdvancedChatActivity={false}
      />,
    )

    expect(screen.getByText('Final answer')).toBeTruthy()
    expect(screen.queryByText('read_file')).toBeNull()
    expect(screen.queryByText('tool-call-1')).toBeNull()
    expect(screen.queryByText(/notes\.txt/)).toBeNull()
  })

  it('shows summarized tool activity when advanced chat activity is enabled', () => {
    renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot({ messages: createToolActivityMessages() })}
        streamingEntry={null}
        pendingApproval={null}
        endRef={createRef<HTMLDivElement>()}
        showAdvancedChatActivity
      />,
    )

    expect(screen.getByText('read_file')).toBeTruthy()
    expect(screen.getByText('tool-call-1')).toBeTruthy()
    expect(screen.getByText('Read File · notes.txt · 2 lines')).toBeTruthy()
    expect(screen.getByText(/hello/)).toBeTruthy()
  })

  it('collapses long advanced tool output by default', () => {
    const longContent = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n')

    renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot({
          messages: [
            {
              id: 'tool-message-1',
              conversationId: 'conversation-1',
              runId: 'run-1',
              role: 'tool',
              toolCallId: 'tool-call-1',
              toolName: 'read_file',
              content: JSON.stringify({ path: 'long.txt', content: longContent }),
              createdAt: '2026-04-29T10:02:00.000Z',
            },
          ],
        })}
        streamingEntry={null}
        pendingApproval={null}
        endRef={createRef<HTMLDivElement>()}
        showAdvancedChatActivity
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Show full output' })

    expect(screen.getByText('Read File · long.txt · 80 lines')).toBeTruthy()
    expect(toggle).toBeTruthy()
    expect(screen.queryByText(/line 80/)).toBeNull()
  })

  it('uses a compact working indicator before non-advanced streaming content starts', () => {
    renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot()}
        streamingEntry={[
          'run-1',
          {
            conversationId: 'conversation-1',
            content: '',
            reasoning: { text: '', summaries: [], encryptedCount: 0, isStreaming: false },
            phase: 'contacting_provider',
            activity: [{ id: 'activity-1', title: 'Provider request sent', detail: 'openrouter · model' }],
            isStreaming: true,
          },
        ]}
        pendingApproval={null}
        endRef={createRef<HTMLDivElement>()}
        showAdvancedChatActivity={false}
      />,
    )

    expect(screen.getByText('Contacting provider…')).toBeTruthy()
    expect(screen.queryByText('assistant streaming')).toBeNull()
    expect(screen.queryByText('Provider request sent')).toBeNull()
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

function createToolActivityMessages(): ConversationSnapshot['messages'] {
  return [
    {
      id: 'assistant-tool-call-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'tool-call-1', actionId: 'read_file', input: { path: 'notes.txt' } }],
      createdAt: '2026-04-29T10:01:00.000Z',
    },
    {
      id: 'tool-message-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      role: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
      content: JSON.stringify({ path: 'notes.txt', content: 'hello\nworld' }),
      createdAt: '2026-04-29T10:02:00.000Z',
    },
    {
      id: 'assistant-final-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      role: 'assistant',
      content: 'Final answer',
      createdAt: '2026-04-29T10:03:00.000Z',
    },
  ]
}
