import type {
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  Conversation,
  Message,
  Run,
  RunEvent,
  RunStatus,
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
  getConversation(conversationId: string): Promise<ConversationSnapshot>
  createRun(run: Run): Promise<void>
  getRun(runId: string): Promise<Run | null>
  updateRunStatus(input: UpdateRunStatusInput): Promise<void>
  saveMessage(message: Message): Promise<void>
  appendEvent(event: RunEvent): Promise<void>
  listRunEvents(runId: string): Promise<RunEvent[]>
  saveApprovalRequest(request: ApprovalRequest): Promise<void>
  saveApprovalResolution(resolution: ApprovalResolution): Promise<void>
  getSettings(): Promise<AppSettings | null>
  saveSettings(settings: AppSettings): Promise<void>
}
