// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionCompactionList } from '@nano-harness/shared'

import { SessionCompactionCard } from '../../src/renderer/components/SessionCompactionCard'

describe('SessionCompactionCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders compaction records and triggers compaction', async () => {
    const user = userEvent.setup()
    const onCompactSession = vi.fn()

    render(<SessionCompactionCard compactions={createCompactions()} isCompacting={false} onCompactSession={onCompactSession} />)

    expect(screen.getByText('Session compaction')).toBeTruthy()
    expect(screen.getByText('Compacted 2 messages across 1 run.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Compact now' }))

    expect(onCompactSession).toHaveBeenCalledTimes(1)
  })
})

function createCompactions(): SessionCompactionList {
  return {
    compactions: [{
      id: 'session-1-compaction-1',
      sessionId: 'session-1',
      conversationId: 'conversation-1',
      summary: 'Compacted 2 messages across 1 run.',
      sourceMessageCount: 2,
      sourceRunIds: ['run-1'],
      createdAt: '2026-04-29T10:00:00.000Z',
    }],
  }
}
