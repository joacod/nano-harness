import type { ActionDefinition, AppSettings, JsonValue, Message, ProviderKey, ProviderReasoningDelta, ReasoningDetail, Run } from '@nano-harness/shared'

export interface ProviderActionRequest {
  toolCallId: string
  actionId: string
  input: Record<string, JsonValue>
}

export interface ProviderGenerateInput {
  run: Run
  messages: Message[]
  actions: ActionDefinition[]
  settings: AppSettings
  providerApiKey?: string
  signal: AbortSignal
  onDelta?: (delta: string) => Promise<void> | void
  onReasoningDelta?: (delta: ProviderReasoningDelta) => Promise<void> | void
}

export interface ProviderGenerateResult {
  content?: string
  reasoning?: string
  reasoningDetails?: ReasoningDetail[]
  actionCalls?: ProviderActionRequest[]
}

export interface Provider {
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult>
}

export interface ProviderCredentialResolver {
  getProviderApiKey(provider: ProviderKey): Promise<string | null>
}
