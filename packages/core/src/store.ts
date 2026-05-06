import type {
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  Conversation,
  Message,
  MemoryProposal,
  MemoryRecall,
  MemoryRecord,
  ResolveMemoryProposalInput,
  Run,
  RunEvent,
  RunStatus,
  Session,
  SessionExport,
} from '@nano-harness/shared'

export interface ConversationSnapshot {
  conversation: Conversation | null
  runs: Run[]
  messages: Message[]
  events: RunEvent[]
  approvalRequests: ApprovalRequest[]
  approvalResolutions: ApprovalResolution[]
}

export interface UpdateRunStatusInput {
  runId: string
  status: RunStatus
  startedAt?: string
  finishedAt?: string
  failureMessage?: string
}

export interface Store {
  initialize(): Promise<void>
  saveConversation(conversation: Conversation): Promise<void>
  listConversations(): Promise<Conversation[]>
  listSessions(): Promise<Session[]>
  forkSession(sessionId: string): Promise<Session>
  cloneSession(sessionId: string): Promise<Session>
  exportSession(sessionId: string): Promise<SessionExport>
  listRuns(statuses?: RunStatus[]): Promise<Run[]>
  getConversation(conversationId: string): Promise<ConversationSnapshot>
  createRun(run: Run): Promise<void>
  getRun(runId: string): Promise<Run | null>
  updateRunStatus(input: UpdateRunStatusInput): Promise<void>
  saveMessage(message: Message): Promise<void>
  appendEvent(event: RunEvent): Promise<void>
  listRunEvents(runId: string): Promise<RunEvent[]>
  recallMemory(input: { query: string; settings: AppSettings }): Promise<MemoryRecall>
  listMemoryRecords(): Promise<MemoryRecord[]>
  listMemoryProposals(status?: MemoryProposal['status']): Promise<MemoryProposal[]>
  saveMemoryProposal(proposal: MemoryProposal): Promise<void>
  resolveMemoryProposal(input: ResolveMemoryProposalInput): Promise<MemoryProposal>
  saveApprovalRequest(request: ApprovalRequest): Promise<void>
  saveApprovalResolution(resolution: ApprovalResolution): Promise<void>
  getSettings(): Promise<AppSettings | null>
  saveSettings(settings: AppSettings): Promise<void>
}
