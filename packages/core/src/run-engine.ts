import type {
  ActionCall,
  ActionDefinition,
  ActionResult,
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  JsonValue,
  Message,
  Run,
  RunCreateInput,
  RunEvent,
  RunStatus,
} from '@nano-harness/shared'

import type { ConversationSnapshot, Store } from './store'

export interface EventBus {
  publish(event: RunEvent): Promise<void> | void
}

export interface ProviderActionRequest {
  toolCallId: string
  actionId: string
  input: Record<string, JsonValue>
}

export interface ProviderGenerateInput {
  run: Run
  messages: Message[]
  actions: ActionDefinition[]
  settings: AppSettings
  signal: AbortSignal
  onDelta?: (delta: string) => Promise<void> | void
}

export interface ProviderGenerateResult {
  content?: string
  actionCalls?: ProviderActionRequest[]
}

export interface Provider {
  generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult>
}

export interface ActionExecutionInput {
  run: Run
  action: ActionDefinition
  call: ActionCall
  settings: AppSettings
  signal: AbortSignal
}

export interface ActionExecutor {
  listDefinitions(): Promise<ActionDefinition[]>
  getDefinition(actionId: string): Promise<ActionDefinition | null>
  execute(input: ActionExecutionInput): Promise<ActionResult>
}

export interface PolicyInput {
  run: Run
  action: ActionDefinition
  actionCall: ActionCall
  settings: AppSettings
}

export interface PolicyDecision {
  effect: 'allow' | 'deny' | 'require_approval'
  reason?: string
}

export interface Policy {
  evaluateAction(input: PolicyInput): Promise<PolicyDecision>
}

export interface ApprovalCoordinator {
  waitForDecision(input: {
    request: ApprovalRequest
    run: Run
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ApprovalResolution>
  resolveDecision?(input: { approvalRequestId: string; decision: ApprovalResolution['decision'] }): Promise<boolean> | boolean
}

export interface RunEngineDependencies {
  store: Store
  provider: Provider
  actionExecutor: ActionExecutor
  policy: Policy
  eventBus?: EventBus
  approvalCoordinator?: ApprovalCoordinator
  now?: () => string
  createId?: () => string
  maxProviderTurns?: number
}

export interface RunHandle {
  runId: string
  cancel(): Promise<void>
}

export interface RunEngine {
  startRun(input: RunCreateInput): Promise<RunHandle>
  resumeRun(runId: string): Promise<void>
  cancelRun(runId: string): Promise<void>
  resolveApproval(input: { runId: string; approvalRequestId: string; decision: ApprovalResolution['decision'] }): Promise<void>
}

type PendingApprovalContext = {
  request: ApprovalRequest
  actionCall: ActionCall
}

type ContinueRunContext = {
  run: Run
  snapshot: ConversationSnapshot
  settings: AppSettings
  signal: AbortSignal
  pendingApproval?: PendingApprovalContext
}

class RunAbortError extends Error {
  constructor() {
    super('Run cancelled')
    this.name = 'AbortError'
  }
}

const noopEventBus: EventBus = {
  publish() {},
}

function defaultNow(): string {
  return new Date().toISOString()
}

function defaultCreateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function assertStatusTransition(current: RunStatus, next: RunStatus): void {
  if (current === next) {
    return
  }

  const transitions: Record<RunStatus, readonly RunStatus[]> = {
    created: ['started', 'cancelled'],
    started: ['waiting_approval', 'completed', 'failed', 'cancelled'],
    waiting_approval: ['started', 'completed', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
  }

  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid run status transition from ${current} to ${next}`)
  }
}

function isTerminalStatus(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function deriveConversationTitle(prompt: string): string {
  const title = prompt.trim().replace(/\s+/g, ' ')
  return title.length > 60 ? `${title.slice(0, 57)}...` : title
}

function stringifyToolOutput(value: JsonValue | undefined): string {
  if (value === undefined) {
    return ''
  }

  return JSON.stringify(value, null, 2)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function getLatestPendingApproval(snapshot: ConversationSnapshot): PendingApprovalContext | null {
  const resolvedIds = new Set(snapshot.approvalResolutions.map((resolution) => resolution.approvalRequestId))
  const pendingRequest = [...snapshot.approvalRequests]
    .reverse()
    .find((request) => !resolvedIds.has(request.id))

  if (!pendingRequest) {
    return null
  }

  const actionRequestedEvent = [...snapshot.events].reverse().find((event) => {
    return event.type === 'action.requested' && event.payload.actionCall.id === pendingRequest.actionCallId
  })

  if (!actionRequestedEvent || actionRequestedEvent.type !== 'action.requested') {
    throw new Error(`Missing action.requested event for approval request ${pendingRequest.id}`)
  }

  return {
    request: pendingRequest,
    actionCall: actionRequestedEvent.payload.actionCall,
  }
}

export class CoreRunEngine implements RunEngine {
  private readonly store: Store
  private readonly provider: Provider
  private readonly actionExecutor: ActionExecutor
  private readonly policy: Policy
  private readonly eventBus: EventBus
  private readonly approvalCoordinator?: ApprovalCoordinator
  private readonly now: () => string
  private readonly createId: () => string
  private readonly maxProviderTurns: number
  private readonly activeRuns = new Map<string, AbortController>()

  constructor(dependencies: RunEngineDependencies) {
    this.store = dependencies.store
    this.provider = dependencies.provider
    this.actionExecutor = dependencies.actionExecutor
    this.policy = dependencies.policy
    this.eventBus = dependencies.eventBus ?? noopEventBus
    this.approvalCoordinator = dependencies.approvalCoordinator
    this.now = dependencies.now ?? defaultNow
    this.createId = dependencies.createId ?? defaultCreateId
    this.maxProviderTurns = dependencies.maxProviderTurns ?? 8
  }

  async startRun(input: RunCreateInput): Promise<RunHandle> {
    const settings = await this.requireSettings()
    const snapshot = await this.store.getConversation(input.conversationId)
    const now = this.now()

    if (!snapshot.conversation) {
      await this.store.saveConversation({
        id: input.conversationId,
        title: deriveConversationTitle(input.prompt),
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await this.store.saveConversation({
        ...snapshot.conversation,
        updatedAt: now,
      })
    }

    const run: Run = {
      id: this.createId(),
      conversationId: input.conversationId,
      status: 'created',
      createdAt: now,
    }

    const userMessage: Message = {
      id: this.createId(),
      conversationId: input.conversationId,
      runId: run.id,
      role: 'user',
      content: input.prompt,
      createdAt: now,
    }

    await this.store.createRun(run)
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: now,
      type: 'run.created',
      payload: { run },
    })
    await this.store.saveMessage(userMessage)
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: now,
      type: 'message.created',
      payload: { message: userMessage },
    })

    const controller = new AbortController()
    this.activeRuns.set(run.id, controller)

    void this.executeRun({
      run,
      snapshot: {
        conversation: snapshot.conversation,
        runs: [...snapshot.runs, run],
        messages: [...snapshot.messages, userMessage],
        events: snapshot.events,
        approvalRequests: snapshot.approvalRequests,
        approvalResolutions: snapshot.approvalResolutions,
      },
      settings,
      signal: controller.signal,
    }).finally(() => {
      this.activeRuns.delete(run.id)
    })

    return {
      runId: run.id,
      cancel: async () => this.cancelRun(run.id),
    }
  }

  async resumeRun(runId: string): Promise<void> {
    if (this.activeRuns.has(runId)) {
      return
    }

    const run = await this.store.getRun(runId)

    if (!run) {
      throw new Error(`Run ${runId} not found`)
    }

    if (isTerminalStatus(run.status)) {
      return
    }

    const settings = await this.requireSettings()
    const snapshot = await this.store.getConversation(run.conversationId)
    const pendingApproval = run.status === 'waiting_approval' ? getLatestPendingApproval(snapshot) : null
    const controller = new AbortController()

    this.activeRuns.set(run.id, controller)

    await this.executeRun({
      run,
      snapshot,
      settings,
      signal: controller.signal,
      pendingApproval: pendingApproval ?? undefined,
    }).finally(() => {
      this.activeRuns.delete(run.id)
    })
  }

  async cancelRun(runId: string): Promise<void> {
    const activeController = this.activeRuns.get(runId)

    if (activeController) {
      activeController.abort()
      return
    }

    const run = await this.store.getRun(runId)

    if (!run || isTerminalStatus(run.status)) {
      return
    }

    await this.transitionRun(run, 'cancelled', {
      finishedAt: this.now(),
    })
    await this.emitEvent({
      id: this.createId(),
      runId,
      timestamp: this.now(),
      type: 'run.cancelled',
      payload: { reason: 'cancelled before execution resumed' },
    })
  }

  async resolveApproval(input: {
    runId: string
    approvalRequestId: string
    decision: ApprovalResolution['decision']
  }): Promise<void> {
    const run = await this.store.getRun(input.runId)

    if (!run) {
      throw new Error(`Run ${input.runId} not found`)
    }

    const snapshot = await this.store.getConversation(run.conversationId)
    const request = snapshot.approvalRequests.find((approvalRequest) => approvalRequest.id === input.approvalRequestId)

    if (!request || request.runId !== run.id) {
      throw new Error(`Approval request ${input.approvalRequestId} not found for run ${run.id}`)
    }

    const alreadyResolved = snapshot.approvalResolutions.some(
      (resolution) => resolution.approvalRequestId === input.approvalRequestId,
    )

    if (alreadyResolved) {
      return
    }

    const resolvedByCoordinator = await this.approvalCoordinator?.resolveDecision?.({
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
    })

    if (resolvedByCoordinator) {
      return
    }

    if (run.status !== 'waiting_approval') {
      throw new Error(`Run ${run.id} is not waiting for approval`)
    }

    await this.persistApprovalResolution(run, {
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      decidedAt: this.now(),
    })

    if (input.decision === 'granted') {
      await this.resumeRun(run.id)
      return
    }

    await this.cancelRun(run.id)
  }

  private async executeRun(context: ContinueRunContext): Promise<void> {
    let run = context.run
    const snapshot = context.snapshot

    try {
      if (context.pendingApproval) {
        run = await this.resumeFromPendingApproval(run, context.pendingApproval, context.settings, snapshot, context.signal)
      } else if (run.status === 'created') {
        run = await this.startLifecycle(run)
      }

      let messages = [...snapshot.messages]

      for (let turn = 0; turn < this.maxProviderTurns; turn += 1) {
        if (context.signal.aborted) {
          throw new RunAbortError()
        }

        await this.emitEvent({
          id: this.createId(),
          runId: run.id,
          timestamp: this.now(),
          type: 'provider.requested',
          payload: { model: context.settings.provider.model },
        })

        let streamedMessage = ''
        const actions = await this.actionExecutor.listDefinitions()
        const providerResult = await this.provider.generate({
          run,
          messages,
          actions,
          settings: context.settings,
          signal: context.signal,
          onDelta: async (delta) => {
            streamedMessage += delta
            await this.emitEvent({
              id: this.createId(),
              runId: run.id,
              timestamp: this.now(),
              type: 'provider.delta',
              payload: { delta },
            })
          },
        })

        const assistantContent = providerResult.content ?? streamedMessage
        let providerMessageId = messages.at(-1)?.id
        const assistantToolCalls = providerResult.actionCalls?.map((actionCall) => ({
          id: actionCall.toolCallId,
          actionId: actionCall.actionId,
          input: actionCall.input,
        }))

        if (assistantContent || (assistantToolCalls && assistantToolCalls.length > 0)) {
          const assistantMessage: Message = {
            id: this.createId(),
            conversationId: run.conversationId,
            runId: run.id,
            role: 'assistant',
            content: assistantContent,
            toolCalls: assistantToolCalls,
            createdAt: this.now(),
          }

          await this.store.saveMessage(assistantMessage)
          await this.emitEvent({
            id: this.createId(),
            runId: run.id,
            timestamp: assistantMessage.createdAt,
            type: 'message.created',
            payload: { message: assistantMessage },
          })
          messages = [...messages, assistantMessage]
          providerMessageId = assistantMessage.id
        }

        if (providerMessageId) {
          await this.emitEvent({
            id: this.createId(),
            runId: run.id,
            timestamp: this.now(),
            type: 'provider.completed',
            payload: { messageId: providerMessageId },
          })
        }

        const actionRequests = providerResult.actionCalls ?? []

        if (actionRequests.length === 0) {
          await this.completeRun(run)
          return
        }

        for (const actionRequest of actionRequests) {
          const actionOutput = await this.handleActionRequest(run, actionRequest, context.settings, context.signal)

          if (actionOutput === null) {
            return
          }

          messages = [...messages, actionOutput]
        }
      }

      throw new Error(`Run exceeded max provider turns (${this.maxProviderTurns})`)
    } catch (error) {
      if (isAbortError(error)) {
        await this.cancelActiveRun(run, 'cancelled while running')
        return
      }

      const failureMessage = error instanceof Error ? error.message : 'Unknown run failure'
      await this.failRun(run, failureMessage)
    }
  }

  private async startLifecycle(run: Run): Promise<Run> {
    const startedAt = this.now()
    return this.transitionRun(run, 'started', { startedAt }, 'run.started', { startedAt })
  }

  private async completeRun(run: Run): Promise<void> {
    const finishedAt = this.now()
    await this.transitionRun(run, 'completed', { finishedAt }, 'run.completed', { finishedAt })
  }

  private async failRun(run: Run, message: string): Promise<void> {
    const finishedAt = this.now()
    await this.transitionRun(run, 'failed', { finishedAt, failureMessage: message }, 'run.failed', { message })
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: finishedAt,
      type: 'provider.error',
      payload: { message },
    })
  }

  private async cancelActiveRun(run: Run, reason: string): Promise<void> {
    const finishedAt = this.now()
    await this.transitionRun(run, 'cancelled', { finishedAt }, 'run.cancelled', { reason })
  }

  private async handleActionRequest(
    run: Run,
    actionRequest: ProviderActionRequest,
    settings: AppSettings,
    signal: AbortSignal,
  ): Promise<Message | null> {
    const actionDefinition = await this.actionExecutor.getDefinition(actionRequest.actionId)

    if (!actionDefinition) {
      throw new Error(`Unknown action ${actionRequest.actionId}`)
    }

    const actionCall: ActionCall = {
      id: this.createId(),
      runId: run.id,
      actionId: actionRequest.actionId,
      input: actionRequest.input,
      requestedAt: this.now(),
    }

    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: actionCall.requestedAt,
      type: 'action.requested',
      payload: { actionCall },
    })

    const policyDecision = await this.policy.evaluateAction({
      run,
      action: actionDefinition,
      actionCall,
      settings,
    })

    if (policyDecision.effect === 'deny') {
      throw new Error(policyDecision.reason ?? `Action ${actionDefinition.id} is denied by policy`)
    }

    if (policyDecision.effect === 'require_approval') {
      const resolution = await this.requireApproval({
        run,
        actionCall,
        reason: policyDecision.reason ?? `Approval required for ${actionDefinition.title}`,
        settings,
        signal,
      })

      if (resolution.decision === 'rejected') {
        await this.cancelActiveRun(run, `approval rejected for ${actionDefinition.id}`)
        return null
      }
    }

    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: this.now(),
      type: 'action.started',
      payload: { actionCallId: actionCall.id },
    })

    const result = await this.actionExecutor.execute({
      run,
      action: actionDefinition,
      call: actionCall,
      settings,
      signal,
    })

    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: this.now(),
      type: result.status === 'completed' ? 'action.completed' : 'action.failed',
      payload: { result },
    })

    if (result.status === 'failed') {
      throw new Error(result.errorMessage ?? `Action ${actionDefinition.id} failed`)
    }

    const toolMessage: Message = {
      id: this.createId(),
      conversationId: run.conversationId,
      runId: run.id,
      role: 'tool',
      content: stringifyToolOutput(result.output),
      toolCallId: actionRequest.toolCallId,
      toolName: actionRequest.actionId,
      createdAt: this.now(),
    }

    await this.store.saveMessage(toolMessage)
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: toolMessage.createdAt,
      type: 'message.created',
      payload: { message: toolMessage },
    })

    return toolMessage
  }

  private async requireApproval(input: {
    run: Run
    actionCall: ActionCall
    reason: string
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ApprovalResolution> {
    if (!this.approvalCoordinator) {
      throw new Error('Approval required but no approval coordinator is configured')
    }

    const request: ApprovalRequest = {
      id: this.createId(),
      runId: input.run.id,
      actionCallId: input.actionCall.id,
      reason: input.reason,
      requestedAt: this.now(),
    }

    await this.store.saveApprovalRequest(request)
    await this.transitionRun(input.run, 'waiting_approval', undefined, 'run.waiting_approval', {
      approvalRequestId: request.id,
    })
    await this.emitEvent({
      id: this.createId(),
      runId: input.run.id,
      timestamp: request.requestedAt,
      type: 'approval.required',
      payload: { approvalRequest: request },
    })

    const resolution = await this.approvalCoordinator.waitForDecision({
      request,
      run: { ...input.run, status: 'waiting_approval' },
      settings: input.settings,
      signal: input.signal,
    })

    return this.persistApprovalResolution(input.run, resolution)
  }

  private async persistApprovalResolution(run: Run, resolution: ApprovalResolution): Promise<ApprovalResolution> {
    await this.store.saveApprovalResolution(resolution)
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: resolution.decidedAt,
      type: resolution.decision === 'granted' ? 'approval.granted' : 'approval.rejected',
      payload: { resolution },
    })

    if (resolution.decision === 'granted') {
      await this.transitionRun(run, 'started', undefined, 'run.started', {
        startedAt: this.now(),
      })
    }

    return resolution
  }

  private async resumeFromPendingApproval(
    run: Run,
    pendingApproval: PendingApprovalContext,
    settings: AppSettings,
    snapshot: ConversationSnapshot,
    signal: AbortSignal,
  ): Promise<Run> {
    const existingResolution = snapshot.approvalResolutions.find(
      (resolution) => resolution.approvalRequestId === pendingApproval.request.id,
    )

    const resolution =
      existingResolution ??
      (await this.waitForPendingApprovalDecision(run, pendingApproval.request, settings, signal))

    if (resolution.decision === 'rejected') {
      await this.cancelActiveRun(run, `approval rejected for ${pendingApproval.actionCall.actionId}`)
      throw new RunAbortError()
    }

    return {
      ...run,
      status: 'started',
    }
  }

  private async waitForPendingApprovalDecision(
    run: Run,
    request: ApprovalRequest,
    settings: AppSettings,
    signal: AbortSignal,
  ): Promise<ApprovalResolution> {
    if (!this.approvalCoordinator) {
      throw new Error('Approval required but no approval coordinator is configured')
    }

    const resolution = await this.approvalCoordinator.waitForDecision({
      request,
      run,
      settings,
      signal,
    })

    return this.persistApprovalResolution(run, resolution)
  }

  private async transitionRun<TPayload extends Record<string, unknown> | undefined>(
    run: Run,
    nextStatus: RunStatus,
    update?: {
      startedAt?: string
      finishedAt?: string
      failureMessage?: string
    },
    eventType?: Extract<RunEvent['type'], `run.${string}`>,
    payload?: TPayload,
  ): Promise<Run> {
    assertStatusTransition(run.status, nextStatus)

    await this.store.updateRunStatus({
      runId: run.id,
      status: nextStatus,
      startedAt: update?.startedAt,
      finishedAt: update?.finishedAt,
      failureMessage: update?.failureMessage,
    })

    const nextRun: Run = {
      ...run,
      status: nextStatus,
      startedAt: update?.startedAt ?? run.startedAt,
      finishedAt: update?.finishedAt ?? run.finishedAt,
      failureMessage: update?.failureMessage ?? run.failureMessage,
    }

    if (eventType && payload) {
      await this.emitEvent({
        id: this.createId(),
        runId: run.id,
        timestamp: this.now(),
        type: eventType,
        payload,
      } as Extract<RunEvent, { type: typeof eventType }>)
    }

    return nextRun
  }

  private async emitEvent(event: RunEvent): Promise<void> {
    await this.store.appendEvent(event)
    await this.eventBus.publish(event)
  }

  private async requireSettings(): Promise<AppSettings> {
    const settings = await this.store.getSettings()

    if (!settings) {
      throw new Error('App settings must be configured before starting a run')
    }

    return settings
  }
}

export class StaticPolicy implements Policy {
  async evaluateAction(input: PolicyInput): Promise<PolicyDecision> {
    if (input.settings.workspace.approvalPolicy === 'always') {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
      }
    }

    if (input.action.requiresApproval && input.settings.workspace.approvalPolicy === 'never') {
      return {
        effect: 'deny',
        reason: `${input.action.title} requires approval, but approvals are disabled in settings`,
      }
    }

    if (input.action.requiresApproval) {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
      }
    }

    return {
      effect: 'allow',
    }
  }
}

export class InMemoryEventBus implements EventBus {
  private readonly listeners = new Set<(event: RunEvent) => Promise<void> | void>()

  subscribe(listener: (event: RunEvent) => Promise<void> | void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async publish(event: RunEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event)
    }
  }
}
