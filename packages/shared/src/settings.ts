import { z } from 'zod'

export const approvalPolicySchema = z.enum(['always', 'on-request', 'never'])

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>

export const providerKeySchema = z.enum(['openrouter', 'llama-cpp', 'openai'])

export type ProviderKey = z.infer<typeof providerKeySchema>

export const providerAuthMethodSchema = z.enum(['api-key', 'none', 'oauth'])

export type ProviderAuthMethod = z.infer<typeof providerAuthMethodSchema>

export const reasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh'])

export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>

export const reasoningSettingsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('off') }),
  z.object({
    mode: z.literal('effort'),
    effort: reasoningEffortSchema,
  }),
])

export type ReasoningSettings = z.infer<typeof reasoningSettingsSchema>

export const providerDefaultModels = {
  openrouter: 'x-ai/grok-4.1-fast',
  'llama-cpp': 'ggml-org/gemma-3-1b-it-GGUF',
  openai: 'gpt-5.4-mini',
} as const satisfies Record<ProviderKey, string>

export const providerCatalog = {
  openrouter: {
    key: 'openrouter',
    label: 'OpenRouter',
    adapterId: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: providerDefaultModels.openrouter,
    requiresApiKey: true,
    authMethods: ['api-key'],
    defaultAuthMethod: 'api-key',
  },
  'llama-cpp': {
    key: 'llama-cpp',
    label: 'llama.cpp',
    adapterId: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8080/v1',
    defaultModel: providerDefaultModels['llama-cpp'],
    requiresApiKey: false,
    authMethods: ['none'],
    defaultAuthMethod: 'none',
  },
  openai: {
    key: 'openai',
    label: 'OpenAI',
    adapterId: 'chatgpt-subscription',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    defaultModel: providerDefaultModels.openai,
    requiresApiKey: false,
    authMethods: ['oauth'],
    defaultAuthMethod: 'oauth',
  },
} as const satisfies Record<ProviderKey, {
  key: ProviderKey
  label: string
  adapterId: string
  baseUrl: string
  defaultModel: string
  requiresApiKey: boolean
  authMethods: readonly ProviderAuthMethod[]
  defaultAuthMethod: ProviderAuthMethod
}>

export function getProviderDefinition(provider: ProviderKey) {
  return providerCatalog[provider]
}

export const providerOptionSchema = z.object({
  key: providerKeySchema,
  label: z.string().min(1),
  defaultModel: z.string().min(1),
})

export const providerOptions = Object.values(providerCatalog).map((provider) =>
  providerOptionSchema.parse({
    key: provider.key,
    label: provider.label,
    defaultModel: provider.defaultModel,
  }),
)

const currentProviderSettingsSchema = z.object({
  provider: providerKeySchema,
  model: z.string().min(1),
  baseUrl: z.string().min(1).optional(),
  reasoning: reasoningSettingsSchema.optional(),
})

export const providerSettingsSchema = currentProviderSettingsSchema

export type ProviderSettings = z.infer<typeof providerSettingsSchema>

export function createDefaultProviderSettings(provider: ProviderKey): ProviderSettings {
  const definition = getProviderDefinition(provider)

  return {
    provider: definition.key,
    model: definition.defaultModel,
    baseUrl: definition.baseUrl,
  }
}

export const workspaceSettingsSchema = z.object({
  rootPath: z.string().min(1),
  approvalPolicy: approvalPolicySchema,
})

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>

export const appSettingsSchema = z.object({
  provider: providerSettingsSchema,
  workspace: workspaceSettingsSchema,
})

export type AppSettings = z.infer<typeof appSettingsSchema>
