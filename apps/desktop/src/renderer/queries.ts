import { queryOptions } from '@tanstack/react-query'

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

export const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'],
  queryFn: () => window.desktop.listConversations(),
})

export function conversationQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ['conversation', conversationId],
    queryFn: () => window.desktop.getConversation({ conversationId }),
  })
}

export function createConversationId(): string {
  return `conversation-${crypto.randomUUID()}`
}
