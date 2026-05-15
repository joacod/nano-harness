import type { DesktopApi } from '../../../../packages/shared/src'

const now = '2026-05-13T00:00:00.000Z'
const conversation = {
  id: 'conversation-1',
  title: 'Browser mock session',
  createdAt: now,
  updatedAt: now,
}

const session = {
  id: 'session-1',
  conversationId: conversation.id,
  parentSessionId: null,
  rootSessionId: 'session-1',
  title: conversation.title,
  createdAt: now,
  updatedAt: now,
}

export function installDevDesktopMock() {
  if (!import.meta.env.DEV || typeof window === 'undefined' || window.desktop) {
    return
  }

  const shouldInstallMock = new URLSearchParams(window.location.search).get('desktopMock') === '1'

  if (!shouldInstallMock) {
    return
  }

  window.desktop = createDevDesktopMock()
}

function createDevDesktopMock(): DesktopApi {
  return {
    getContext: async () => ({ platform: 'darwin', version: '0.0.1-dev', dataPath: '/tmp/nano-harness-dev.db' }),
    listConversations: async () => [conversation],
    listSessions: async () => [session],
    getProviderStatus: async () => ({
      providerId: 'openrouter',
      providerLabel: 'OpenRouter',
      model: 'deepseek/deepseek-v4-pro',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyLabel: 'OPENROUTER_API_KEY',
      apiKeyPresent: true,
      isReady: true,
      issues: [],
      hints: [],
    }),
    listSkills: async () => ({ skills: [] }),
    listMcpInventory: async () => ({ servers: [], tools: [], resources: [] }),
    listMemoryRecords: async () => ({ records: [] }),
    listMemoryProposals: async () => ({ proposals: [] }),
    resolveMemoryProposal: async () => undefined,
    listSpecChanges: async () => ({ changes: [] }),
    getSpecChange: async () => ({ change: null }),
    readSpecArtifact: async (input) => ({ kind: input.artifactKind, path: '.nano/specs/mock.md', content: '' }),
    startSpecRun: async () => ({ runId: 'run-1' }),
    getProviderCredentialStatus: async () => ({ apiKeyPresent: true }),
    saveProviderAuth: async () => undefined,
    startProviderOauth: async (input) => ({ provider: input.provider }),
    clearProviderAuth: async () => undefined,
    exportData: async () => ({ exportedFilePath: '/tmp/nano-harness-export.zip' }),
    exportRunEvidence: async () => ({ exportedFilePath: '/tmp/run-evidence.json', changedFiles: [], validationOutputs: 0 }),
    importData: async () => ({ imported: false }),
    getSettings: async () => null,
    saveSettings: async (settings) => settings,
    getConversation: async () => ({
      conversation,
      runs: [],
      messages: [],
      events: [],
      approvalRequests: [],
      approvalResolutions: [],
    }),
    forkSession: async (input) => ({ sessionId: `${input.sessionId}-fork`, conversationId: `${input.sessionId}-fork` }),
    cloneSession: async (input) => ({ sessionId: `${input.sessionId}-clone`, conversationId: `${input.sessionId}-clone` }),
    listSessionCompactions: async () => ({ compactions: [] }),
    compactSession: async (input) => ({
      compaction: {
        id: `${input.sessionId}-compaction-1`,
        sessionId: input.sessionId,
        conversationId: conversation.id,
        summary: 'Compacted 0 messages across 0 runs.',
        sourceMessageCount: 0,
        sourceRunIds: [],
        createdAt: now,
      },
    }),
    exportSession: async () => ({ exportedFilePath: '/tmp/session.json' }),
    startRun: async () => ({ runId: 'run-1' }),
    resumeRun: async () => undefined,
    cancelRun: async () => undefined,
    resolveApproval: async () => undefined,
    openExternalUrl: async () => undefined,
    showItemInFolder: async () => undefined,
    onRunEvent: () => () => undefined,
  }
}
