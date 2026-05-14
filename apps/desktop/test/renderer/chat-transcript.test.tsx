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

  it('keeps completed run activity visible when advanced chat activity is enabled', () => {
    const { container } = renderWithQueryClient(
      <ChatTranscript
        snapshot={createSnapshot({
          runs: [{
            id: 'run-1',
            conversationId: 'conversation-1',
            status: 'completed',
            role: 'build',
            createdAt: '2026-04-29T10:00:00.000Z',
            startedAt: '2026-04-29T10:01:00.000Z',
            finishedAt: '2026-04-29T10:03:00.000Z',
          }],
          events: [
            {
              id: 'event-1',
              runId: 'run-1',
              type: 'provider.requested',
              timestamp: '2026-04-29T10:00:30.000Z',
              payload: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
            },
            {
              id: 'event-2',
              runId: 'run-1',
              type: 'action.requested',
              timestamp: '2026-04-29T10:01:20.000Z',
              payload: {
                actionCall: {
                  id: 'action-call-1',
                  runId: 'run-1',
                  actionId: 'fetch_url',
                  input: { url: 'https://example.com' },
                  requestedAt: '2026-04-29T10:01:20.000Z',
                },
              },
            },
            {
              id: 'event-3',
              runId: 'run-1',
              type: 'action.completed',
              timestamp: '2026-04-29T10:01:30.000Z',
              payload: {
                result: {
                  id: 'action-result-1',
                  actionCallId: 'action-call-1',
                  status: 'completed',
                  output: { status: 200 },
                  completedAt: '2026-04-29T10:01:30.000Z',
                },
              },
            },
            {
              id: 'event-4',
              runId: 'run-1',
              type: 'provider.requested',
              timestamp: '2026-04-29T10:01:50.000Z',
              payload: { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
            },
            {
              id: 'event-5',
              runId: 'run-1',
              type: 'run.completed',
              timestamp: '2026-04-29T10:02:10.000Z',
              payload: { finishedAt: '2026-04-29T10:02:10.000Z' },
            },
          ],
          messages: [
            {
              id: 'user-message-1',
              conversationId: 'conversation-1',
              runId: 'run-1',
              role: 'user',
              content: 'Please answer this',
              createdAt: '2026-04-29T10:00:00.000Z',
            },
            {
              id: 'assistant-tool-call-1',
              conversationId: 'conversation-1',
              runId: 'run-1',
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'tool-call-1', actionId: 'fetch_url', input: { url: 'https://example.com' } }],
              createdAt: '2026-04-29T10:01:10.000Z',
            },
            {
              id: 'tool-message-1',
              conversationId: 'conversation-1',
              runId: 'run-1',
              role: 'tool',
              toolCallId: 'tool-call-1',
              toolName: 'fetch_url',
              content: JSON.stringify({ url: 'https://example.com', status: 200 }),
              createdAt: '2026-04-29T10:01:40.000Z',
            },
            {
              id: 'assistant-final-1',
              conversationId: 'conversation-1',
              runId: 'run-1',
              role: 'assistant',
              content: 'Final answer',
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

    expect(screen.getAllByText('assistant activity')).toHaveLength(4)
    expect(screen.getAllByText('Provider request sent')).toHaveLength(2)
    expect(screen.getAllByText('openrouter · deepseek/deepseek-v4-pro')).toHaveLength(2)
    expect(screen.getByText('Action requested: fetch_url')).toBeTruthy()
    expect(screen.getByText('Run completed')).toBeTruthy()

    const transcriptItems = [...container.querySelectorAll('.message-bubble')].map((item) => item.textContent ?? '')
    expect(transcriptItems[0]).toContain('Please answer this')
    expect(transcriptItems[1]).toContain('assistant activity')
    expect(transcriptItems[1]).toContain('Provider request sent')
    expect(transcriptItems[2]).toContain('fetch_url')
    expect(transcriptItems[3]).toContain('assistant activity')
    expect(transcriptItems[3]).toContain('Action requested: fetch_url')
    expect(transcriptItems[4]).toContain('tool')
    expect(transcriptItems[5]).toContain('assistant activity')
    expect(transcriptItems[5]).toContain('Provider request sent')
    expect(transcriptItems[6]).toContain('Final answer')
    expect(transcriptItems[7]).toContain('assistant activity')
    expect(transcriptItems[7]).toContain('Run completed')
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
