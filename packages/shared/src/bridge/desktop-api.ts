import { z } from 'zod'

import { runEventSchema } from '../events'
import { runCreateInputSchema } from '../runs'
import { appSettingsSchema } from '../settings'
import type { SkillInventory } from '../skills'
import type { McpInventory } from '../mcp'
import type { MemoryProposalList, MemoryRecordList, ResolveMemoryProposalInput } from '../memory'
import type { SessionExportResult, SessionInput, SessionList, SessionMutationResult } from '../sessions'
import type { ClearProviderAuthInput, ExportRunEvidenceInput, GetConversationInput, OpenExternalUrlInput, ProviderCredentialInput, ReadSpecArtifactInput, ResolveApprovalInput, RunIdInput, SaveProviderAuthInput, ShowItemInFolderInput, SpecChangeInput, StartProviderOauthInput, StartSpecRunInput } from './inputs'
import type {
  ConversationList,
  ConversationSnapshot,
  DesktopContext,
  ExportDataResult,
  ExportRunEvidenceResult,
  ImportDataResult,
  ProviderCredentialStatus,
  ProviderStatus,
  SpecArtifactReadResult,
  SpecChangeDetailResult,
  SpecChangeList,
  StartProviderOauthResult,
  StartRunResult,
} from './outputs'

export type DesktopApi = {
  getContext(): Promise<DesktopContext>
  listConversations(): Promise<ConversationList>
  listSessions(): Promise<SessionList>
  getProviderStatus(): Promise<ProviderStatus | null>
  listSkills(): Promise<SkillInventory>
  listMcpInventory(): Promise<McpInventory>
  listMemoryRecords(): Promise<MemoryRecordList>
  listMemoryProposals(): Promise<MemoryProposalList>
  resolveMemoryProposal(input: ResolveMemoryProposalInput): Promise<void>
  listSpecChanges(): Promise<SpecChangeList>
  getSpecChange(input: SpecChangeInput): Promise<SpecChangeDetailResult>
  readSpecArtifact(input: ReadSpecArtifactInput): Promise<SpecArtifactReadResult>
  startSpecRun(input: StartSpecRunInput): Promise<StartRunResult>
  getProviderCredentialStatus(input: ProviderCredentialInput): Promise<ProviderCredentialStatus>
  saveProviderAuth(input: SaveProviderAuthInput): Promise<void>
  startProviderOauth(input: StartProviderOauthInput): Promise<StartProviderOauthResult>
  clearProviderAuth(input: ClearProviderAuthInput): Promise<void>
  exportData(): Promise<ExportDataResult>
  exportRunEvidence(input: ExportRunEvidenceInput): Promise<ExportRunEvidenceResult>
  importData(): Promise<ImportDataResult>
  getSettings(): Promise<z.infer<typeof appSettingsSchema> | null>
  saveSettings(settings: z.infer<typeof appSettingsSchema>): Promise<z.infer<typeof appSettingsSchema>>
  getConversation(input: GetConversationInput): Promise<ConversationSnapshot>
  forkSession(input: SessionInput): Promise<SessionMutationResult>
  cloneSession(input: SessionInput): Promise<SessionMutationResult>
  exportSession(input: SessionInput): Promise<SessionExportResult>
  startRun(input: z.infer<typeof runCreateInputSchema>): Promise<StartRunResult>
  resumeRun(input: RunIdInput): Promise<void>
  cancelRun(input: RunIdInput): Promise<void>
  resolveApproval(input: ResolveApprovalInput): Promise<void>
  openExternalUrl(input: OpenExternalUrlInput): Promise<void>
  showItemInFolder(input: ShowItemInFolderInput): Promise<void>
  onRunEvent(listener: (event: z.infer<typeof runEventSchema>) => void): () => void
}
