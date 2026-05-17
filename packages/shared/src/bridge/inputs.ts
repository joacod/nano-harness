import { z } from 'zod'

import { approvalResolutionSchema } from '../approvals'
import { agentRoleSchema } from '../roles'
import { providerAuthMethodSchema, providerKeySchema } from '../settings'
import { specArtifactKindSchema } from '../spec'

export const providerCredentialInputSchema = z.object({
  provider: providerKeySchema,
})

export type ProviderCredentialInput = z.infer<typeof providerCredentialInputSchema>

export const saveProviderAuthInputSchema = z.object({
  provider: providerKeySchema,
  authMethod: z.literal('api-key'),
  apiKey: z.string().min(1),
})

export type SaveProviderAuthInput = z.infer<typeof saveProviderAuthInputSchema>

export const startProviderOauthInputSchema = z.object({
  provider: providerKeySchema,
  authMethod: providerAuthMethodSchema.optional(),
})

export type StartProviderOauthInput = z.infer<typeof startProviderOauthInputSchema>

export const clearProviderAuthInputSchema = z.object({
  provider: providerKeySchema,
  authMethod: providerAuthMethodSchema.optional(),
})

export type ClearProviderAuthInput = z.infer<typeof clearProviderAuthInputSchema>

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

export const exportRunEvidenceInputSchema = runIdInputSchema

export type ExportRunEvidenceInput = z.infer<typeof exportRunEvidenceInputSchema>

export const getConversationInputSchema = z.object({
  conversationId: z.string().min(1),
})

export type GetConversationInput = z.infer<typeof getConversationInputSchema>

export const specChangeInputSchema = z.object({
  changeId: z.string().min(1),
})

export type SpecChangeInput = z.infer<typeof specChangeInputSchema>

export const readSpecArtifactInputSchema = z.object({
  changeId: z.string().min(1).optional(),
  artifactKind: specArtifactKindSchema,
  relativePath: z.string().min(1).optional(),
})

export type ReadSpecArtifactInput = z.infer<typeof readSpecArtifactInputSchema>

export const startSpecRunInputSchema = z.object({
  conversationId: z.string().min(1),
  changeId: z.string().min(1),
  role: agentRoleSchema,
  taskIds: z.array(z.string().min(1)).optional(),
  workflowIntent: z.enum(['propose', 'plan', 'build', 'verify', 'archive']).optional(),
})

export type StartSpecRunInput = z.infer<typeof startSpecRunInputSchema>

export const startBenchmarkSuiteInputSchema = z.object({
  suite: z.string().min(1),
  caseIds: z.array(z.string().min(1)).optional(),
})

export type StartBenchmarkSuiteInput = z.infer<typeof startBenchmarkSuiteInputSchema>

export const openExternalUrlInputSchema = z.object({
  url: z.url(),
})

export type OpenExternalUrlInput = z.infer<typeof openExternalUrlInputSchema>

export const showItemInFolderInputSchema = z.object({
  filePath: z.string().min(1),
})

export type ShowItemInFolderInput = z.infer<typeof showItemInFolderInputSchema>
