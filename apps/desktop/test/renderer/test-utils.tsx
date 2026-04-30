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
    getProviderStatus: async () => null,
    getProviderCredentialStatus: async () => ({ apiKeyPresent: false }),
    saveProviderApiKey: async () => undefined,
    clearProviderApiKey: async () => undefined,
    startProviderOauth: async (input) => ({ provider: input.provider }),
    clearProviderAuth: async () => undefined,
    exportData: async () => ({ exportedFilePath: null }),
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
    startRun: async () => ({ runId: 'run-1' }),
    resumeRun: async () => undefined,
    cancelRun: async () => undefined,
    resolveApproval: async () => undefined,
    openExternalUrl: async () => undefined,
    onRunEvent: () => () => undefined,
    ...overrides,
  }
}
