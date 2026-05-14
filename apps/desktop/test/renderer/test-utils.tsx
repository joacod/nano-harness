import type { ReactElement } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'

import type { AppSettings, DesktopApi } from '@nano-harness/shared'

export function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}

export function createDesktopMock(overrides?: Partial<DesktopApi>): DesktopApi {
  return {
    getContext: async () => ({ platform: 'darwin', version: '0.0.1', dataPath: '/tmp/nano-harness.db' }),
    listConversations: async () => [],
    listSessions: async () => [],
    getProviderStatus: async () => null,
    listSkills: async () => ({ skills: [] }),
    listMcpInventory: async () => ({ servers: [], tools: [], resources: [] }),
    listMemoryRecords: async () => ({ records: [] }),
    listMemoryProposals: async () => ({ proposals: [] }),
    resolveMemoryProposal: async () => undefined,
    listSpecChanges: async () => ({ changes: [] }),
    getSpecChange: async () => ({ change: null }),
    readSpecArtifact: async (input) => ({ kind: input.artifactKind, path: '.nano/specs/mock.md', content: '' }),
    startSpecRun: async () => ({ runId: 'run-1' }),
    getProviderCredentialStatus: async () => ({ apiKeyPresent: false }),
    saveProviderAuth: async () => undefined,
    startProviderOauth: async (input) => ({ provider: input.provider }),
    clearProviderAuth: async () => undefined,
    exportData: async () => ({ exportedFilePath: null }),
    exportRunEvidence: async () => ({ exportedFilePath: '/tmp/run-evidence.json', changedFiles: [], validationOutputs: 0 }),
    importData: async () => ({ imported: false }),
    getSettings: async () => null,
    saveSettings: async (settings: AppSettings) => settings,
    getConversation: async () => ({
      conversation: null,
      runs: [],
      messages: [],
      events: [],
      approvalRequests: [],
      approvalResolutions: [],
    }),
    forkSession: async (input) => ({ sessionId: `${input.sessionId}-fork`, conversationId: `${input.sessionId}-fork` }),
    cloneSession: async (input) => ({ sessionId: `${input.sessionId}-clone`, conversationId: `${input.sessionId}-clone` }),
    exportSession: async () => ({ exportedFilePath: '/tmp/session.json' }),
    startRun: async () => ({ runId: 'run-1' }),
    resumeRun: async () => undefined,
    cancelRun: async () => undefined,
    resolveApproval: async () => undefined,
    openExternalUrl: async () => undefined,
    showItemInFolder: async () => undefined,
    onRunEvent: () => () => undefined,
    ...overrides,
  }
}
