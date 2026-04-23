import { z } from 'zod'

export const approvalPolicySchema = z.enum(['always', 'on-request', 'never'])

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>

export const providerSettingsSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  apiKeyEnvVar: z.string().min(1),
  baseUrl: z.url().optional(),
})

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
