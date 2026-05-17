import { z } from 'zod'

import { approvalRequestSchema, approvalResolutionSchema } from '../approvals'
import { runEventSchema } from '../events'
import { conversationSchema, messageSchema } from '../messages'
import { runSchema } from '../runs'
import { benchmarkSuiteRunResultSchema } from '../harness'
import { providerAuthMethodSchema } from '../settings'
import { sessionCompactionListSchema, sessionCompactionResultSchema, sessionExportResultSchema, sessionListSchema, sessionMutationResultSchema } from '../sessions'
import { specArtifactKindSchema, specChangeDetailSchema } from '../spec'

export const desktopPlatformSchema = z.enum(['darwin', 'linux', 'win32'])

export type DesktopPlatform = z.infer<typeof desktopPlatformSchema>

export const desktopContextSchema = z.object({
  platform: desktopPlatformSchema,
  version: z.string().min(1),
  dataPath: z.string().min(1),
})

export type DesktopContext = z.infer<typeof desktopContextSchema>

export const conversationSnapshotSchema = z.object({
  conversation: conversationSchema.nullable(),
  runs: z.array(runSchema),
  messages: z.array(messageSchema),
  events: z.array(runEventSchema),
  approvalRequests: z.array(approvalRequestSchema),
  approvalResolutions: z.array(approvalResolutionSchema),
})

export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>

export const conversationListSchema = z.array(conversationSchema)

export type ConversationList = z.infer<typeof conversationListSchema>

export { sessionCompactionListSchema, sessionCompactionResultSchema, sessionExportResultSchema, sessionListSchema, sessionMutationResultSchema }

export const providerStatusSchema = z.object({
  providerId: z.string().min(1),
  providerLabel: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKeyLabel: z.string().min(1),
  apiKeyPresent: z.boolean(),
  authMethod: providerAuthMethodSchema.optional(),
  authLabel: z.string().min(1).optional(),
  authPresent: z.boolean().optional(),
  authMethods: z.array(z.object({
    authMethod: providerAuthMethodSchema,
    label: z.string().min(1),
    present: z.boolean(),
    accountId: z.string().min(1).optional(),
  })).optional(),
  isReady: z.boolean(),
  issues: z.array(z.string().min(1)),
  hints: z.array(z.string().min(1)),
})

export type ProviderStatus = z.infer<typeof providerStatusSchema>

export const providerCredentialStatusSchema = z.object({
  apiKeyPresent: z.boolean(),
  oauthPresent: z.boolean().optional(),
  oauthAccountId: z.string().min(1).optional(),
  authMethods: z.array(z.object({
    authMethod: providerAuthMethodSchema,
    present: z.boolean(),
    accountId: z.string().min(1).optional(),
  })).optional(),
})

export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>

export const startProviderOauthResultSchema = z.object({
  provider: z.string().min(1),
  accountId: z.string().min(1).optional(),
})

export type StartProviderOauthResult = z.infer<typeof startProviderOauthResultSchema>

export const startRunResultSchema = z.object({
  runId: z.string().min(1),
})

export type StartRunResult = z.infer<typeof startRunResultSchema>

export { benchmarkSuiteRunResultSchema }

export const exportDataResultSchema = z.object({
  exportedFilePath: z.string().min(1).nullable(),
})

export type ExportDataResult = z.infer<typeof exportDataResultSchema>

export const exportRunEvidenceResultSchema = z.object({
  exportedFilePath: z.string().min(1),
  changedFiles: z.array(z.string()),
  validationOutputs: z.number().int().nonnegative(),
})

export type ExportRunEvidenceResult = z.infer<typeof exportRunEvidenceResultSchema>

export const importDataResultSchema = z.object({
  imported: z.boolean(),
  backupFilePath: z.string().min(1).optional(),
})

export type ImportDataResult = z.infer<typeof importDataResultSchema>

export const specChangeListSchema = z.object({
  changes: z.array(specChangeDetailSchema),
})

export type SpecChangeList = z.infer<typeof specChangeListSchema>

export const specChangeDetailResultSchema = z.object({
  change: specChangeDetailSchema.nullable(),
})

export type SpecChangeDetailResult = z.infer<typeof specChangeDetailResultSchema>

export const specArtifactReadResultSchema = z.object({
  kind: specArtifactKindSchema,
  path: z.string().min(1),
  content: z.string(),
})

export type SpecArtifactReadResult = z.infer<typeof specArtifactReadResultSchema>
