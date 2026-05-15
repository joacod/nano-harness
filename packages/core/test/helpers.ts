import type {
  ActionDefinition,
  ActionResult,
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  Conversation,
  Message,
  MemoryProposal,
  MemoryRecall,
  MemoryRecord,
  Run,
  RunCreateInput,
  RunEvent,
  RunStatus,
  Session,
  SessionCompaction,
  SessionExport,
} from '@nano-harness/shared'
import { createDefaultProviderSettings } from '@nano-harness/shared'

import type {
  ActionExecutionInput,
  ActionExecutor,
  ApprovalCoordinator,
  ConversationSnapshot,
  EventBus,
  Policy,
  PolicyDecision,
  Provider,
  ProviderActionRequest,
  ProviderCredentialResolver,
  ProviderGenerateInput,
  ProviderGenerateResult,
  Store,
  UpdateRunStatusInput,
} from '../src'

type ProviderStep = ProviderGenerateResult | ((input: ProviderGenerateInput) => Promise<ProviderGenerateResult>)

export const testSettings: AppSettings = {
  provider: createDefaultProviderSettings('openrouter'),
  workspace: {
    rootPath: '/workspace',
    approvalPolicy: 'on-request',
  },
}

export function createActionDefinition(input: Partial<ActionDefinition> & Pick<ActionDefinition, 'id' | 'title'>): ActionDefinition {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    requiresApproval: input.requiresApproval ?? false,
    inputSchema: input.inputSchema ?? {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  }
}

export function createActionResult(input: {
  actionCallId: string
  status?: ActionResult['status']
  output?: ActionResult['output']
  errorMessage?: string
}): ActionResult {
  return {
    id: `${input.actionCallId}-result`,
    actionCallId: input.actionCallId,
    status: input.status ?? 'completed',
    output: input.output,
    errorMessage: input.errorMessage,
    completedAt: '2026-04-29T10:00:00.000Z',
  }
}

export class FakeStore implements Store {
  conversations = new Map<string, Conversation>()
  runs = new Map<string, Run>()
  messages: Message[] = []
  events: RunEvent[] = []
  approvalRequests: ApprovalRequest[] = []
  approvalResolutions: ApprovalResolution[] = []
  memoryRecords: MemoryRecord[] = []
  memoryProposals: MemoryProposal[] = []
  settings: AppSettings | null = structuredClone(testSettings)
  sessions: Session[] = []
  sessionCompactions: SessionCompaction[] = []

  async initialize(): Promise<void> {}

  async saveConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation)
    if (!this.sessions.some((session) => session.conversationId === conversation.id)) {
      this.sessions.push({
        id: conversation.id,
        conversationId: conversation.id,
        parentSessionId: null,
        rootSessionId: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      })
    }
  }

  async listConversations(): Promise<Conversation[]> {
    return [...this.conversations.values()].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
  }

  async listSessions(): Promise<Session[]> {
    return this.sessions
  }

  async forkSession(sessionId: string): Promise<Session> {
    return this.createChildSession(sessionId, 'fork')
  }

  async cloneSession(sessionId: string): Promise<Session> {
    return this.createChildSession(sessionId, 'clone')
  }

  async listSessionCompactions(sessionId: string): Promise<SessionCompaction[]> {
    return this.sessionCompactions.filter((compaction) => compaction.sessionId === sessionId)
  }

  async createSessionCompaction(sessionId: string): Promise<SessionCompaction> {
    const session = this.sessions.find((item) => item.id === sessionId)

    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const snapshot = await this.getConversation(session.conversationId)
    const compaction: SessionCompaction = {
      id: `${sessionId}-compaction-${this.sessionCompactions.length + 1}`,
      sessionId,
      conversationId: session.conversationId,
      summary: `Compacted ${snapshot.messages.length} messages across ${snapshot.runs.length} runs.`,
      sourceMessageCount: snapshot.messages.length,
      sourceRunIds: snapshot.runs.map((run) => run.id),
      createdAt: '2026-04-29T10:00:00.000Z',
    }

    this.sessionCompactions.push(compaction)
    return compaction
  }

  async exportSession(sessionId: string): Promise<SessionExport> {
    const session = this.sessions.find((item) => item.id === sessionId)

    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const snapshot = await this.getConversation(session.conversationId)
    return {
      session,
      lineage: this.sessions.filter((item) => item.rootSessionId === session.rootSessionId),
      compactions: await this.listSessionCompactions(session.id),
      runs: snapshot.runs,
      messages: snapshot.messages,
      events: snapshot.events,
      approvals: {
        requests: snapshot.approvalRequests,
        resolutions: snapshot.approvalResolutions,
      },
    }
  }

  private createChildSession(sessionId: string, label: string): Session {
    const parent = this.sessions.find((session) => session.id === sessionId)

    if (!parent) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const now = '2026-04-29T10:00:00.000Z'
    const child: Session = {
      id: `${sessionId}-${label}`,
      conversationId: `${sessionId}-${label}`,
      parentSessionId: sessionId,
      rootSessionId: parent.rootSessionId,
      title: `${parent.title} (${label})`,
      createdAt: now,
      updatedAt: now,
    }

    this.sessions.push(child)
    this.conversations.set(child.conversationId, {
      id: child.conversationId,
      title: child.title,
      createdAt: now,
      updatedAt: now,
    })
    return child
  }

  async listRuns(statuses?: RunStatus[]): Promise<Run[]> {
    const runs = [...this.runs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    return statuses?.length ? runs.filter((run) => statuses.includes(run.status)) : runs
  }

  async getConversation(conversationId: string): Promise<ConversationSnapshot> {
    const runIds = [...this.runs.values()]
      .filter((run) => run.conversationId === conversationId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((run) => run.id)

    return {
      conversation: this.conversations.get(conversationId) ?? null,
      runs: runIds.map((runId) => {
        const run = this.runs.get(runId)

        if (!run) {
          throw new Error(`Missing run ${runId}`)
        }

        return run
      }),
      messages: this.messages.filter((message) => message.conversationId === conversationId),
      events: this.events.filter((event) => runIds.includes(event.runId)),
      approvalRequests: this.approvalRequests.filter((request) => runIds.includes(request.runId)),
      approvalResolutions: this.approvalResolutions.filter((resolution) =>
        this.approvalRequests.some((request) => request.id === resolution.approvalRequestId && runIds.includes(request.runId)),
      ),
    }
  }

  async createRun(run: Run): Promise<void> {
    this.runs.set(run.id, run)
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) ?? null
  }

  async updateRunStatus(input: UpdateRunStatusInput): Promise<void> {
    const current = this.runs.get(input.runId)

    if (!current) {
      throw new Error(`Missing run ${input.runId}`)
    }

    this.runs.set(input.runId, {
      ...current,
      status: input.status,
      startedAt: input.startedAt ?? current.startedAt,
      finishedAt: input.finishedAt ?? current.finishedAt,
      failureMessage: input.failureMessage ?? current.failureMessage,
    })
  }

  async saveMessage(message: Message): Promise<void> {
    this.messages.push(message)
  }

  async appendEvent(event: RunEvent): Promise<void> {
    this.events.push(event)
  }

  async listRunEvents(runId: string): Promise<RunEvent[]> {
    return this.events.filter((event) => event.runId === runId)
  }

  async recallMemory(): Promise<MemoryRecall> {
    return { selected: this.memoryRecords, excludedCategories: [] }
  }

  async listMemoryRecords(): Promise<MemoryRecord[]> {
    return this.memoryRecords
  }

  async listMemoryProposals(status?: MemoryProposal['status']): Promise<MemoryProposal[]> {
    return status ? this.memoryProposals.filter((proposal) => proposal.status === status) : this.memoryProposals
  }

  async saveMemoryProposal(proposal: MemoryProposal): Promise<void> {
    const index = this.memoryProposals.findIndex((current) => current.id === proposal.id)

    if (index >= 0) {
      this.memoryProposals[index] = proposal
      return
    }

    this.memoryProposals.push(proposal)
  }

  async resolveMemoryProposal(input: { proposalId: string; decision: 'approved' | 'rejected' }): Promise<MemoryProposal> {
    const proposal = this.memoryProposals.find((current) => current.id === input.proposalId)

    if (!proposal) {
      throw new Error(`Memory proposal ${input.proposalId} not found`)
    }

    const resolved = { ...proposal, status: input.decision, decidedAt: '2026-04-29T10:00:05.000Z' } satisfies MemoryProposal
    await this.saveMemoryProposal(resolved)

    if (input.decision === 'approved') {
      this.memoryRecords.push({
        id: `memory-${proposal.id}`,
        category: proposal.category,
        content: proposal.content,
        source: `proposal:${proposal.id}`,
        runId: proposal.runId,
        confidence: 0.8,
        createdAt: resolved.decidedAt,
        updatedAt: resolved.decidedAt,
      })
    }

    return resolved
  }

  async saveApprovalRequest(request: ApprovalRequest): Promise<void> {
    this.approvalRequests.push(request)
  }

  async saveApprovalResolution(resolution: ApprovalResolution): Promise<void> {
    const existingIndex = this.approvalResolutions.findIndex(
      (existingResolution) => existingResolution.approvalRequestId === resolution.approvalRequestId,
    )

    if (existingIndex >= 0) {
      this.approvalResolutions[existingIndex] = resolution
      return
    }

    this.approvalResolutions.push(resolution)
  }

  async getSettings(): Promise<AppSettings | null> {
    return this.settings
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.settings = settings
  }
}

export class FakeProvider implements Provider {
  readonly calls: ProviderGenerateInput[] = []

  constructor(private readonly steps: ProviderStep[]) {}

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    this.calls.push(input)
    const step = this.steps.shift()

    if (!step) {
      throw new Error('No provider step configured')
    }

    return typeof step === 'function' ? await step(input) : step
  }
}

export class FakeActionExecutor implements ActionExecutor {
  readonly executions: ActionExecutionInput[] = []

  constructor(
    private readonly definitions: ActionDefinition[],
    private readonly executeImpl: (input: ActionExecutionInput) => Promise<ActionResult>,
  ) {}

  async listDefinitions(): Promise<ActionDefinition[]> {
    return this.definitions
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    return this.definitions.find((definition) => definition.id === actionId) ?? null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    this.executions.push(input)
    return await this.executeImpl(input)
  }
}

export class FakePolicy implements Policy {
  readonly calls: Array<{ actionId: string }> = []

  constructor(private readonly decide: () => Promise<PolicyDecision> | PolicyDecision) {}

  async evaluateAction(input: Parameters<Policy['evaluateAction']>[0]): Promise<PolicyDecision> {
    this.calls.push({ actionId: input.action.id })
    return await this.decide()
  }
}

export class RecordingEventBus implements EventBus {
  readonly published: RunEvent[] = []

  async publish(event: RunEvent): Promise<void> {
    this.published.push(event)
  }
}

export class ManualApprovalCoordinator implements ApprovalCoordinator {
  private readonly pending = new Map<
    string,
    {
      resolve: (resolution: ApprovalResolution) => void
    }
  >()

  async waitForDecision(input: { request: ApprovalRequest; signal: AbortSignal }): Promise<ApprovalResolution> {
    return await new Promise<ApprovalResolution>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(input.request.id)
        const error = new Error('Approval wait aborted')
        error.name = 'AbortError'
        reject(error)
      }

      if (input.signal.aborted) {
        onAbort()
        return
      }

      this.pending.set(input.request.id, {
        resolve: (resolution) => {
          input.signal.removeEventListener('abort', onAbort)
          this.pending.delete(input.request.id)
          resolve(resolution)
        },
      })

      input.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  async resolveDecision(input: { approvalRequestId: string; decision: ApprovalResolution['decision'] }): Promise<boolean> {
    const pending = this.pending.get(input.approvalRequestId)

    if (!pending) {
      return false
    }

    pending.resolve({
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      decidedAt: '2026-04-29T10:00:05.000Z',
    })

    return true
  }
}

export const defaultCredentialResolver: ProviderCredentialResolver = {
  async getProviderAuth() {
    return { authMethod: 'api-key', apiKey: 'test-api-key' }
  },
}

export async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Timed out waiting for condition')
}

export function createBlockingProviderStep(): (input: ProviderGenerateInput) => Promise<ProviderGenerateResult> {
  return async ({ signal }) => {
    return await new Promise<ProviderGenerateResult>((_resolve, reject) => {
      const abort = () => {
        const error = new Error('Aborted')
        error.name = 'AbortError'
        reject(error)
      }

      if (signal.aborted) {
        abort()
        return
      }

      signal.addEventListener('abort', abort, { once: true })
    })
  }
}

export function createToolRequest(actionId: string, toolCallId = 'tool-call-1'): ProviderActionRequest {
  return {
    toolCallId,
    actionId,
    input: { path: 'notes.txt' },
  }
}

export function createRunInput(overrides: Partial<RunCreateInput> = {}): RunCreateInput {
  return {
    conversationId: overrides.conversationId ?? 'conversation-1',
    prompt: overrides.prompt ?? 'Read notes.txt and summarize it.',
    role: overrides.role,
  }
}
