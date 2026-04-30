import type {
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  Conversation,
  Message,
  ProviderStatus,
  Run,
} from '@nano-harness/shared'

import type { Page } from '@playwright/test'

export type MockEvent = {
  id: string
  runId: string
  timestamp: string
  type: string
  payload: Record<string, unknown>
}

export type MockSnapshot = {
  conversation: Conversation | null
  runs: Run[]
  messages: Message[]
  events: MockEvent[]
  approvalRequests: ApprovalRequest[]
  approvalResolutions: ApprovalResolution[]
}

export type MockSetup = {
  conversations: Conversation[]
  snapshots: Record<string, MockSnapshot>
}

export type DesktopMockState = {
  settings: AppSettings
  providerStatus: ProviderStatus
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

export function createEmptyMockSetup(): MockSetup {
  return {
    conversations: [],
    snapshots: {},
  }
}

export async function installDesktopMock(page: Page, setup: MockSetup): Promise<void> {
  await page.addInitScript((setupJson: string) => {
    const initialSetup = JSON.parse(setupJson) as MockSetup
    const state: DesktopMockState & {
      context: {
        platform: string
        version: string
        dataPath: string
      }
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

    function createStartedSnapshot(input: {
      conversationId: string
      title: string
      runId: string
      prompt: string
      timestamp: string
      messageId: string
    }): MockSnapshot {
      return {
        conversation: {
          id: input.conversationId,
          title: input.title,
          createdAt: input.timestamp,
          updatedAt: input.timestamp,
        },
        runs: [
          {
            id: input.runId,
            conversationId: input.conversationId,
            status: 'created',
            createdAt: input.timestamp,
          },
        ],
        messages: [
          {
            id: input.messageId,
            conversationId: input.conversationId,
            runId: input.runId,
            role: 'user',
            content: input.prompt,
            createdAt: input.timestamp,
          },
        ],
        events: [],
        approvalRequests: [],
        approvalResolutions: [],
      }
    }

    window.__desktopMock = {
      emitEvent,
      getState() {
        return structuredClone({
          settings: state.settings,
          providerStatus: state.providerStatus,
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
      async saveProviderAuth() {},
      async startProviderOauth(input: { provider: string }) {
        return { provider: input.provider }
      },
      async clearProviderAuth() {},
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
        const snapshot = createStartedSnapshot({
          conversationId: input.conversationId,
          title: conversationTitle,
          runId,
          prompt: input.prompt,
          timestamp: now,
          messageId: `message-user-${state.runCounter}`,
        })
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
          snapshot.runs = snapshot.runs.map((run) =>
            run.id === input.runId ? { ...run, status: input.decision === 'granted' ? 'started' : 'cancelled' } : run,
          )
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
  }, JSON.stringify(setup))
}

export async function getMockState(page: Page): Promise<ReturnType<Window['__desktopMock']['getState']>> {
  return await page.evaluate(() => window.__desktopMock.getState())
}

export async function emitRunEvent(page: Page, event: MockEvent): Promise<void> {
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
      saveProviderAuth(input: unknown): Promise<void>
      startProviderOauth(input: unknown): Promise<unknown>
      clearProviderAuth(input: unknown): Promise<void>
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
        settings: DesktopMockState['settings']
        providerStatus: DesktopMockState['providerStatus']
        calls: DesktopMockState['calls']
        lastRunId: DesktopMockState['lastRunId']
        conversations: DesktopMockState['conversations']
        snapshots: DesktopMockState['snapshots']
      }
      setSnapshot(conversationId: string, snapshot: MockSnapshot): void
    }
  }
}
