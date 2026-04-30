import { z } from 'zod'

import { runEventSchema } from '../events'
import { runCreateInputSchema } from '../runs'
import { appSettingsSchema } from '../settings'
import type { ClearProviderAuthInput, GetConversationInput, OpenExternalUrlInput, ProviderCredentialInput, ResolveApprovalInput, RunIdInput, SaveProviderAuthInput, StartProviderOauthInput } from './inputs'
import type {
  ConversationList,
  ConversationSnapshot,
  DesktopContext,
  ExportDataResult,
  ImportDataResult,
  ProviderCredentialStatus,
  ProviderStatus,
  StartProviderOauthResult,
  StartRunResult,
} from './outputs'

export type DesktopApi = {
  getContext(): Promise<DesktopContext>
  listConversations(): Promise<ConversationList>
  getProviderStatus(): Promise<ProviderStatus | null>
  getProviderCredentialStatus(input: ProviderCredentialInput): Promise<ProviderCredentialStatus>
  saveProviderAuth(input: SaveProviderAuthInput): Promise<void>
  startProviderOauth(input: StartProviderOauthInput): Promise<StartProviderOauthResult>
  clearProviderAuth(input: ClearProviderAuthInput): Promise<void>
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
