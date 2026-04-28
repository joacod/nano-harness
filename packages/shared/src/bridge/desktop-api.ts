import { z } from 'zod'

import { runEventSchema } from '../events'
import { runCreateInputSchema } from '../runs'
import { appSettingsSchema } from '../settings'
import type { GetConversationInput, OpenExternalUrlInput, ProviderCredentialInput, ResolveApprovalInput, RunIdInput, SaveProviderApiKeyInput } from './inputs'
import type {
  ConversationList,
  ConversationSnapshot,
  DesktopContext,
  ExportDataResult,
  ImportDataResult,
  ProviderCredentialStatus,
  ProviderStatus,
  StartRunResult,
} from './outputs'

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
  openExternalUrl(input: OpenExternalUrlInput): Promise<void>
  onRunEvent(listener: (event: z.infer<typeof runEventSchema>) => void): () => void
}
