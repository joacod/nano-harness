import { expect, test } from '@playwright/test'

import { createEmptyMockSetup, emitRunEvent, getMockState, installDesktopMock } from './desktop-mock'

test.beforeEach(async ({ page }) => {
  await installDesktopMock(page, createEmptyMockSetup())
})

test('loads the app shell with a mocked desktop bridge', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Start new session' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Command input' })).toBeVisible()

  await page.getByRole('button', { name: 'Open sidebar' }).click()

  await expect(page.getByRole('heading', { name: 'Agent deck' })).toBeVisible()
  await expect(page.getByText('Provider online')).toBeVisible()
})

test('starts a run and renders streamed output from live run events', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('Enter an instruction for the local harness…').fill('Summarize notes.txt')
  await page.getByRole('button', { name: 'Send prompt' }).click()

  await expect(page).toHaveURL(/\/conversations\//)
  await expect(page.getByRole('heading', { name: 'Summarize notes.txt' })).toBeVisible()
  await expect(page.locator('article').filter({ hasText: 'Summarize notes.txt' }).first()).toBeVisible()

  const mockState = await getMockState(page)
  expect(mockState.lastRunId).not.toBeNull()

  if (!mockState.lastRunId) {
    throw new Error('Expected startRun to produce a run id')
  }

  const runId = mockState.lastRunId

  await emitRunEvent(page, {
    id: 'event-provider-requested',
    runId,
    timestamp: '2026-04-29T10:00:02.000Z',
    type: 'provider.requested',
    payload: {
      provider: 'OpenRouter',
      model: 'x-ai/grok-4.1-fast',
    },
  })
  await emitRunEvent(page, {
    id: 'event-provider-delta-1',
    runId,
    timestamp: '2026-04-29T10:00:03.000Z',
    type: 'provider.delta',
    payload: {
      delta: 'Hello ',
    },
  })
  await emitRunEvent(page, {
    id: 'event-provider-delta-2',
    runId,
    timestamp: '2026-04-29T10:00:04.000Z',
    type: 'provider.delta',
    payload: {
      delta: 'world',
    },
  })

  await expect(page.getByText('Hello world')).toBeVisible()
})

test('shows an approval request and lets the user grant it', async ({ page }) => {
  await installDesktopMock(page, {
    conversations: [
      {
        id: 'conversation-approval',
        title: 'Review approval',
        createdAt: '2026-04-29T10:00:00.000Z',
        updatedAt: '2026-04-29T10:00:10.000Z',
      },
    ],
    snapshots: {
      'conversation-approval': {
        conversation: {
          id: 'conversation-approval',
          title: 'Review approval',
          createdAt: '2026-04-29T10:00:00.000Z',
          updatedAt: '2026-04-29T10:00:10.000Z',
        },
        runs: [
          {
            id: 'run-approval',
            conversationId: 'conversation-approval',
            status: 'waiting_approval',
            createdAt: '2026-04-29T10:00:01.000Z',
            startedAt: '2026-04-29T10:00:02.000Z',
          },
        ],
        messages: [
          {
            id: 'message-user',
            conversationId: 'conversation-approval',
            runId: 'run-approval',
            role: 'user',
            content: 'Write release notes',
            createdAt: '2026-04-29T10:00:01.000Z',
          },
        ],
        events: [
          {
            id: 'event-provider-requested',
            runId: 'run-approval',
            timestamp: '2026-04-29T10:00:02.000Z',
            type: 'provider.requested',
            payload: {
              provider: 'OpenRouter',
              model: 'x-ai/grok-4.1-fast',
            },
          },
          {
            id: 'event-action-requested',
            runId: 'run-approval',
            timestamp: '2026-04-29T10:00:03.000Z',
            type: 'action.requested',
            payload: {
              actionCall: {
                id: 'call-approval',
                runId: 'run-approval',
                actionId: 'write_file',
                input: { path: 'release-notes.md' },
                requestedAt: '2026-04-29T10:00:03.000Z',
              },
            },
          },
        ],
        approvalRequests: [
          {
            id: 'approval-1',
            runId: 'run-approval',
            actionCallId: 'call-approval',
            reason: 'Write access requires confirmation',
            requestedAt: '2026-04-29T10:00:04.000Z',
          },
        ],
        approvalResolutions: [],
      },
    },
  })

  await page.goto('/conversations/conversation-approval')
  await expect(page.getByRole('heading', { name: 'Review approval' })).toBeVisible()

  await page.getByRole('button', { name: 'Open sidebar' }).click()
  await page.getByRole('switch', { name: 'Telemetry' }).click()

  await expect(page.getByRole('heading', { name: 'Action requires confirmation' })).toBeVisible()
  await expect(page.getByText('Write access requires confirmation')).toBeVisible()
  await page.getByRole('button', { name: 'Grant approval' }).click()

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.__desktopMock.getState().calls.resolveApproval.length
    })
  }).toBe(1)

  await expect(page.getByText('Approval granted').first()).toBeVisible()
})
