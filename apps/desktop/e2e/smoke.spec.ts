import { expect, test } from '@playwright/test'

type MockEvent = {
  id: string
  runId: string
  timestamp: string
  type: string
  payload: Record<string, unknown>
}

type MockSnapshot = {
  conversation: {
    id: string
    title: string
    createdAt: string
    updatedAt: string
  } | null
  runs: Array<Record<string, unknown>>
  messages: Array<Record<string, unknown>>
  events: MockEvent[]
  approvalRequests: Array<Record<string, unknown>>
  approvalResolutions: Array<Record<string, unknown>>
}

type MockSetup = {
  conversations: Array<{
    id: string
    title: string
    createdAt: string
    updatedAt: string
  }>
  snapshots: Record<string, MockSnapshot>
}

type DesktopMockState = {
  settings: {
    provider: {
      provider: string
      model: string
    }
    workspace: {
      rootPath: string
      approvalPolicy: string
    }
  }
  calls: {
    startRun: Array<{ conversationId: string; prompt: string }>
    resolveApproval: Array<{ runId: string; approvalRequestId: string; decision: 'granted' | 'rejected' }>
    cancelRun: Array<{ runId: string }>
    resumeRun: Array<{ runId: string }>
    openExternalUrl: Array<{ url: string }>
  }
  lastRunId: string | null
  conversations: MockSetup['conversations']
  snapshots: Record<string, MockSnapshot>
}

test.beforeEach(async ({ page }) => {
  await installDesktopMock(page, {
    conversations: [],
    snapshots: {},
  })
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
  const runId = mockState.lastRunId as string

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

async function installDesktopMock(page: import('@playwright/test').Page, setup: MockSetup) {
  await page.addInitScript((initialSetup: MockSetup) => {
    const state: {
      context: {
        platform: string
        version: string
        dataPath: string
      }
      settings: {
        provider: {
          provider: string
          model: string
        }
        workspace: {
          rootPath: string
          approvalPolicy: string
        }
      }
      providerStatus: {
        providerId: string
        providerLabel: string
        model: string
        baseUrl: string
        apiKeyLabel: string
        apiKeyPresent: boolean
        isReady: boolean
        issues: string[]
        hints: string[]
      }
      conversations: MockSetup['conversations']
      snapshots: Record<string, MockSnapshot>
      calls: DesktopMockState['calls']
      lastRunId: string | null
      runCounter: number
    } = {
      context: {
        platform: 'darwin',
        version: '0.0.1',
        dataPath: '/tmp/nano-harness.db',
      },
      settings: {
        provider: {
          provider: 'openrouter',
          model: 'x-ai/grok-4.1-fast',
        },
        workspace: {
          rootPath: '/workspace',
          approvalPolicy: 'on-request',
        },
      },
      providerStatus: {
        providerId: 'openai-compatible',
        providerLabel: 'OpenRouter',
        model: 'x-ai/grok-4.1-fast',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyLabel: 'Stored securely on this device',
        apiKeyPresent: true,
        isReady: true,
        issues: [],
        hints: [],
      },
      conversations: [...initialSetup.conversations],
      snapshots: structuredClone(initialSetup.snapshots),
      calls: {
        startRun: [],
        resolveApproval: [],
        cancelRun: [],
        resumeRun: [],
        openExternalUrl: [],
      },
      lastRunId: null,
      runCounter: 0,
    }

    const listeners = new Set<(event: MockEvent) => void>()

    function emitEvent(event: MockEvent) {
      for (const listener of listeners) {
        listener(event)
      }
    }

    function ensureConversationListEntry(snapshot: MockSnapshot) {
      if (!snapshot.conversation) {
        return
      }

      const existingIndex = state.conversations.findIndex((conversation) => conversation.id === snapshot.conversation?.id)

      if (existingIndex >= 0) {
        state.conversations[existingIndex] = snapshot.conversation
        return
      }

      state.conversations.unshift(snapshot.conversation)
    }

    window.__desktopMock = {
      emitEvent,
      getState() {
        return structuredClone({
          calls: state.calls,
          lastRunId: state.lastRunId,
          conversations: state.conversations,
          snapshots: state.snapshots,
        })
      },
      setSnapshot(conversationId: string, snapshot: MockSnapshot) {
        state.snapshots[conversationId] = structuredClone(snapshot)
        ensureConversationListEntry(snapshot)
      },
    }

    window.desktop = {
      async getContext() {
        return state.context
      },
      async listConversations() {
        return state.conversations
      },
      async getProviderStatus() {
        return state.providerStatus
      },
      async getProviderCredentialStatus() {
        return { apiKeyPresent: true }
      },
      async saveProviderApiKey() {},
      async clearProviderApiKey() {},
      async exportData() {
        return { exportedFilePath: null }
      },
      async importData() {
        return { imported: false }
      },
      async getSettings() {
        return state.settings
      },
      async saveSettings(nextSettings: DesktopMockState['settings']) {
        state.settings = nextSettings
        return nextSettings
      },
      async getConversation(input: { conversationId: string }) {
        return state.snapshots[input.conversationId] ?? {
          conversation: null,
          runs: [],
          messages: [],
          events: [],
          approvalRequests: [],
          approvalResolutions: [],
        }
      },
      async startRun(input: { conversationId: string; prompt: string }) {
        state.calls.startRun.push(input)
        state.runCounter += 1
        const runId = `run-${state.runCounter}`
        state.lastRunId = runId
        const now = '2026-04-29T10:00:00.000Z'
        const conversationTitle = input.prompt.trim().replace(/\s+/g, ' ').slice(0, 60)
        const snapshot = {
          conversation: {
            id: input.conversationId,
            title: conversationTitle,
            createdAt: now,
            updatedAt: now,
          },
          runs: [
            {
              id: runId,
              conversationId: input.conversationId,
              status: 'created',
              createdAt: now,
            },
          ],
          messages: [
            {
              id: `message-user-${state.runCounter}`,
              conversationId: input.conversationId,
              runId,
              role: 'user',
              content: input.prompt,
              createdAt: now,
            },
          ],
          events: [],
          approvalRequests: [],
          approvalResolutions: [],
        }
        state.snapshots[input.conversationId] = snapshot
        ensureConversationListEntry(snapshot)

        emitEvent({
          id: `event-run-created-${state.runCounter}`,
          runId,
          timestamp: now,
          type: 'run.created',
          payload: {
            run: {
              id: runId,
              conversationId: input.conversationId,
              status: 'created',
              createdAt: now,
            },
          },
        })

        return { runId }
      },
      async resumeRun(input: { runId: string }) {
        state.calls.resumeRun.push(input)
      },
      async cancelRun(input: { runId: string }) {
        state.calls.cancelRun.push(input)
      },
      async resolveApproval(input: { runId: string; approvalRequestId: string; decision: 'granted' | 'rejected' }) {
        state.calls.resolveApproval.push(input)
        const snapshot = Object.values(state.snapshots).find((item) => item.runs.some((run) => run.id === input.runId))

        if (snapshot) {
          snapshot.approvalResolutions.push({
            approvalRequestId: input.approvalRequestId,
            decision: input.decision,
            decidedAt: '2026-04-29T10:00:05.000Z',
          })
          snapshot.runs = snapshot.runs.map((run) => run.id === input.runId ? { ...run, status: input.decision === 'granted' ? 'started' : 'cancelled' } : run)
        }

        emitEvent({
          id: `event-approval-${input.decision}`,
          runId: input.runId,
          timestamp: '2026-04-29T10:00:05.000Z',
          type: input.decision === 'granted' ? 'approval.granted' : 'approval.rejected',
          payload: {
            resolution: {
              approvalRequestId: input.approvalRequestId,
              decision: input.decision,
              decidedAt: '2026-04-29T10:00:05.000Z',
            },
          },
        })
      },
      async openExternalUrl(input: { url: string }) {
        state.calls.openExternalUrl.push(input)
      },
      onRunEvent(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }, setup)
}

async function getMockState(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    return window.__desktopMock.getState()
  })
}

async function emitRunEvent(page: import('@playwright/test').Page, event: MockEvent) {
  await page.evaluate((nextEvent) => {
    window.__desktopMock.emitEvent(nextEvent)
  }, event)
}

declare global {
  interface Window {
    desktop: {
      getContext(): Promise<unknown>
      listConversations(): Promise<unknown>
      getProviderStatus(): Promise<unknown>
      getProviderCredentialStatus(): Promise<unknown>
      saveProviderApiKey(input: unknown): Promise<void>
      clearProviderApiKey(input: unknown): Promise<void>
      exportData(): Promise<unknown>
      importData(): Promise<unknown>
      getSettings(): Promise<unknown>
      saveSettings(input: unknown): Promise<unknown>
      getConversation(input: { conversationId: string }): Promise<MockSnapshot>
      startRun(input: { conversationId: string; prompt: string }): Promise<{ runId: string }>
      resumeRun(input: { runId: string }): Promise<void>
      cancelRun(input: { runId: string }): Promise<void>
      resolveApproval(input: { runId: string; approvalRequestId: string; decision: 'granted' | 'rejected' }): Promise<void>
      openExternalUrl(input: { url: string }): Promise<void>
      onRunEvent(listener: (event: MockEvent) => void): () => void
    }
    __desktopMock: {
      emitEvent(event: MockEvent): void
      getState(): {
        calls: DesktopMockState['calls']
        lastRunId: DesktopMockState['lastRunId']
        conversations: DesktopMockState['conversations']
        snapshots: DesktopMockState['snapshots']
      }
      setSnapshot(conversationId: string, snapshot: MockSnapshot): void
    }
  }
}
