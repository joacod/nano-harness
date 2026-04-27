import { z } from 'zod'

export const approvalPolicySchema = z.enum(['always', 'on-request', 'never'])

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>

export const providerKeySchema = z.enum(['openrouter'])

export type ProviderKey = z.infer<typeof providerKeySchema>

export const providerCatalog = {
  openrouter: {
    key: 'openrouter',
    label: 'OpenRouter',
    adapterId: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'x-ai/grok-4.1-fast',
  },
} as const satisfies Record<ProviderKey, {
  key: ProviderKey
  label: string
  adapterId: string
  baseUrl: string
  defaultModel: string
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
})

export const providerSettingsSchema = currentProviderSettingsSchema

export type ProviderSettings = z.infer<typeof providerSettingsSchema>

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
