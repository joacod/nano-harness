import { z } from 'zod'

import { approvalRequestSchema, approvalResolutionSchema } from './approvals'
import { runEventSchema } from './events'
import { conversationSchema, messageSchema } from './messages'
import { runCreateInputSchema, runSchema } from './runs'
import { appSettingsSchema, providerKeySchema } from './settings'

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

export const providerStatusSchema = z.object({
  providerId: z.string().min(1),
  providerLabel: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKeyLabel: z.string().min(1),
  apiKeyPresent: z.boolean(),
  isReady: z.boolean(),
  issues: z.array(z.string().min(1)),
  hints: z.array(z.string().min(1)),
})

export type ProviderStatus = z.infer<typeof providerStatusSchema>

export const providerCredentialInputSchema = z.object({
  provider: providerKeySchema,
})

export type ProviderCredentialInput = z.infer<typeof providerCredentialInputSchema>

export const providerCredentialStatusSchema = z.object({
  apiKeyPresent: z.boolean(),
})

export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>

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

export const startRunResultSchema = z.object({
  runId: z.string().min(1),
})

export type StartRunResult = z.infer<typeof startRunResultSchema>

export const exportDataResultSchema = z.object({
  exportedFilePath: z.string().min(1).nullable(),
})

export type ExportDataResult = z.infer<typeof exportDataResultSchema>

export const importDataResultSchema = z.object({
  imported: z.boolean(),
  backupFilePath: z.string().min(1).optional(),
})

export type ImportDataResult = z.infer<typeof importDataResultSchema>

export const desktopBridgeChannels = {
  getContext: 'desktop:get-context',
  listConversations: 'desktop:list-conversations',
  getProviderStatus: 'desktop:get-provider-status',
  getProviderCredentialStatus: 'desktop:get-provider-credential-status',
  saveProviderApiKey: 'desktop:save-provider-api-key',
  clearProviderApiKey: 'desktop:clear-provider-api-key',
  exportData: 'desktop:export-data',
  importData: 'desktop:import-data',
  getSettings: 'desktop:get-settings',
  saveSettings: 'desktop:save-settings',
  getConversation: 'desktop:get-conversation',
  startRun: 'desktop:start-run',
  resumeRun: 'desktop:resume-run',
  cancelRun: 'desktop:cancel-run',
  resolveApproval: 'desktop:resolve-approval',
  runEvent: 'desktop:run-event',
} as const

export type DesktopApi = {
  getContext(): Promise<DesktopContext>
  listConversations(): Promise<ConversationList>
  getProviderStatus(): Promise<ProviderStatus | null>
  getProviderCredentialStatus(input: ProviderCredentialInput): Promise<ProviderCredentialStatus>
  saveProviderApiKey(input: SaveProviderApiKeyInput): Promise<void>
  clearProviderApiKey(input: ProviderCredentialInput): Promise<void>
  exportData(): Promise<ExportDataResult>
  importData(): Promise<ImportDataResult>
  getSettings(): Promise<z.infer<typeof appSettingsSchema> | null>
  saveSettings(settings: z.infer<typeof appSettingsSchema>): Promise<z.infer<typeof appSettingsSchema>>
  getConversation(input: GetConversationInput): Promise<ConversationSnapshot>
  startRun(input: z.infer<typeof runCreateInputSchema>): Promise<StartRunResult>
  resumeRun(input: RunIdInput): Promise<void>
  cancelRun(input: RunIdInput): Promise<void>
  resolveApproval(input: ResolveApprovalInput): Promise<void>
  onRunEvent(listener: (event: z.infer<typeof runEventSchema>) => void): () => void
}

export { appSettingsSchema, runCreateInputSchema, runEventSchema }
