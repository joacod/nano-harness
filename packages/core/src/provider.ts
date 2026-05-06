import type { ActionDefinition, AppSettings, JsonValue, MemoryRecall, Message, ProviderAuth, ProviderAuthMethod, ProviderKey, ProviderReasoningDelta, ReasoningDetail, Run, SkillContext } from '@nano-harness/shared'

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
  providerAuth: ProviderAuth
  skills?: SkillContext
  memory?: MemoryRecall
  signal: AbortSignal
  onDelta?: (delta: string) => Promise<void> | void
  onReasoningDelta?: (delta: ProviderReasoningDelta) => Promise<void> | void
}

export interface SkillResolver {
  resolveForRun(input: { settings: AppSettings; run: Run; messages: Message[] }): Promise<SkillContext>
}

export class EmptySkillResolver implements SkillResolver {
  async resolveForRun(): Promise<SkillContext> {
    return { available: [], selected: [] }
  }
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
  getProviderAuth(input: { provider: ProviderKey; authMethod?: ProviderAuthMethod }): Promise<ProviderAuth>
}
