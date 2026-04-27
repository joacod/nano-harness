import { z } from 'zod'

import { approvalResolutionSchema } from '../approvals'
import { providerKeySchema } from '../settings'

export const providerCredentialInputSchema = z.object({
  provider: providerKeySchema,
})

export type ProviderCredentialInput = z.infer<typeof providerCredentialInputSchema>

export const saveProviderApiKeyInputSchema = z.object({
  provider: providerKeySchema,
  apiKey: z.string().min(1),
})

export type SaveProviderApiKeyInput = z.infer<typeof saveProviderApiKeyInputSchema>

export const resolveApprovalInputSchema = z.object({
  runId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  decision: approvalResolutionSchema.shape.decision,
})

export type ResolveApprovalInput = z.infer<typeof resolveApprovalInputSchema>

export const runIdInputSchema = z.object({
  runId: z.string().min(1),
})

export type RunIdInput = z.infer<typeof runIdInputSchema>

export const getConversationInputSchema = z.object({
  conversationId: z.string().min(1),
})

export type GetConversationInput = z.infer<typeof getConversationInputSchema>
