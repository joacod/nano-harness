import { z } from 'zod'

export const approvalPolicySchema = z.enum(['always', 'on-request', 'never'])

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>

export const providerKeySchema = z.enum(['openrouter', 'llama-cpp', 'openai'])

export type ProviderKey = z.infer<typeof providerKeySchema>

export const providerAuthMethodSchema = z.enum(['api-key', 'none', 'oauth'])

export type ProviderAuthMethod = z.infer<typeof providerAuthMethodSchema>

export const providerAdapterIdSchema = z.enum(['openai-compatible', 'chatgpt-subscription'])

export type ProviderAdapterId = z.infer<typeof providerAdapterIdSchema>

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

type ProviderEndpointDefinition = {
  editable: boolean
  description: string
  hint: string
}

type ProviderCatalogDefinition = {
  key: ProviderKey
  label: string
  adapterId: ProviderAdapterId
  baseUrl: string
  defaultModel: string
  requiresApiKey: boolean
  authMethods: readonly ProviderAuthMethod[]
  defaultAuthMethod: ProviderAuthMethod
  authLabels: Partial<Record<ProviderAuthMethod, string>>
  apiKeyLabel: string
  apiKeyMissingIssue?: string
  missingAuthIssue?: string
  modelPrefixHint?: string
  statusHints: readonly string[]
  endpoint: ProviderEndpointDefinition
}

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
    authLabels: { 'api-key': 'API key' },
    apiKeyLabel: 'Stored securely on this device',
    apiKeyMissingIssue: 'Add your OpenRouter API key before starting a hosted-provider run.',
    modelPrefixHint: `OpenRouter models usually include the provider prefix, for example ${providerDefaultModels.openrouter}.`,
    statusHints: [],
    endpoint: {
      editable: true,
      description: 'Model and API endpoint.',
      hint: 'OpenAI-compatible API root.',
    },
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
    authLabels: { none: 'none' },
    apiKeyLabel: 'Optional for this local provider',
    statusHints: ['Start llama-server before running a local model. The API endpoint should expose /v1/chat/completions.'],
    endpoint: {
      editable: true,
      description: 'Model and API endpoint.',
      hint: 'OpenAI-compatible API root.',
    },
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
    authLabels: { oauth: 'ChatGPT account' },
    apiKeyLabel: 'Not used for ChatGPT subscription auth',
    missingAuthIssue: 'Sign in with ChatGPT before starting an OpenAI run.',
    statusHints: [],
    endpoint: {
      editable: false,
      description: 'Model and fixed ChatGPT subscription endpoint.',
      hint: 'Managed by the ChatGPT subscription provider.',
    },
  },
} as const satisfies Record<ProviderKey, ProviderCatalogDefinition>

export function getProviderDefinition(provider: ProviderKey): ProviderCatalogDefinition {
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
