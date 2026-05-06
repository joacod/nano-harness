import { queryOptions } from '@tanstack/react-query'

import type { AppSettings, ConversationSnapshot, ProviderCredentialStatus } from '../../../../packages/shared/src'

export const contextQueryOptions = queryOptions({
  queryKey: ['desktop-context'],
  queryFn: () => window.desktop.getContext(),
})

export const settingsQueryOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: () => window.desktop.getSettings(),
})

export const providerStatusQueryOptions = queryOptions({
  queryKey: ['provider-status'],
  queryFn: () => window.desktop.getProviderStatus(),
})

export const skillsQueryOptions = queryOptions({
  queryKey: ['skills'],
  queryFn: () => window.desktop.listSkills(),
})

export const mcpInventoryQueryOptions = queryOptions({
  queryKey: ['mcp-inventory'],
  queryFn: () => window.desktop.listMcpInventory(),
})

export const memoryRecordsQueryOptions = queryOptions({
  queryKey: ['memory-records'],
  queryFn: () => window.desktop.listMemoryRecords(),
})

export const memoryProposalsQueryOptions = queryOptions({
  queryKey: ['memory-proposals'],
  queryFn: () => window.desktop.listMemoryProposals(),
})

type ProviderCredentialStatusQueryKey = readonly ['provider-credential-status', AppSettings['provider']['provider']]
type ConversationQueryKey = readonly ['conversation', string]

export function providerCredentialStatusQueryOptions(provider: AppSettings['provider']['provider']): ReturnType<typeof queryOptions<ProviderCredentialStatus, Error, ProviderCredentialStatus, ProviderCredentialStatusQueryKey>> {
  return queryOptions({
    queryKey: ['provider-credential-status', provider] as const,
    queryFn: async (): Promise<ProviderCredentialStatus> => window.desktop.getProviderCredentialStatus({ provider }),
  })
}

export const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'],
  queryFn: () => window.desktop.listConversations(),
})

export const sessionsQueryOptions = queryOptions({
  queryKey: ['sessions'],
  queryFn: () => window.desktop.listSessions(),
})

export function conversationQueryOptions(conversationId: string): ReturnType<typeof queryOptions<ConversationSnapshot, Error, ConversationSnapshot, ConversationQueryKey>> {
  return queryOptions({
    queryKey: ['conversation', conversationId] as const,
    queryFn: async (): Promise<ConversationSnapshot> => window.desktop.getConversation({ conversationId }),
  })
}

export function createConversationId(): string {
  return `conversation-${crypto.randomUUID()}`
}
