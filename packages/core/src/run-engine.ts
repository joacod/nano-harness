import type {
  ActionCall,
  ActionDefinition,
  ActionResult,
  AppSettings,
  ApprovalRequest,
  ApprovalResolution,
  HookPhase,
  HookResult,
  JsonValue,
  MemoryProposal,
  Message,
  Run,
  RunCreateInput,
  RunEvent,
  RunStatus,
} from '@nano-harness/shared'
import { getProviderDefinition } from '@nano-harness/shared'

import type { ActionExecutor } from './actions'
import type { ApprovalCoordinator, PendingApprovalContext } from './approvals'
import { getLatestPendingApproval } from './approvals'
import type { EventBus } from './event-bus'
import { noopEventBus } from './event-bus'
import { DryRunPreviewBuilder } from './dry-run-preview-builder'
import type { HookRunner } from './hooks'
import { PersonalRulesHookRunner } from './hooks'
import type { Policy } from './policy'
import type { McpRegistry } from './mcp'
import { EmptyMcpRegistry } from './mcp'
import type { Provider, ProviderActionRequest, ProviderCredentialResolver, ProviderGenerateResult, SkillResolver } from './provider'
import { EmptySkillResolver } from './provider'
import { filterActionsForRole } from './role-actions'
import { assertStatusTransition, isTerminalStatus } from './run-status'
import type { ConversationSnapshot, Store } from './store'

export interface RunEngineDependencies {
  store: Store
  provider: Provider
  providerCredentialResolver: ProviderCredentialResolver
  skillResolver?: SkillResolver
  mcpRegistry?: McpRegistry
  actionExecutor: ActionExecutor
  policy: Policy
  eventBus?: EventBus
  approvalCoordinator?: ApprovalCoordinator
  hookRunner?: HookRunner
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

type ContinueRunContext = {
  run: Run
  snapshot: ConversationSnapshot
  settings: AppSettings
  signal: AbortSignal
  pendingApproval?: PendingApprovalContext
}

type ProviderTurnResult = {
  providerResult: ProviderGenerateResult
  streamedMessage: string
}

type PersistAssistantResultInput = {
  run: Run
  messages: Message[]
  providerResult: ProviderGenerateResult
  streamedMessage: string
}

type PersistAssistantResultOutput = {
  messages: Message[]
  providerMessageId?: string
}

type ExecuteActionRequestsOutput = {
  messages: Message[]
  stopped: boolean
}

class RunAbortError extends Error {
  constructor() {
    super('Run cancelled')
    this.name = 'AbortError'
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}

function defaultCreateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

function stringifyActionResult(result: ActionResult): string {
  if (result.status === 'completed') {
    return stringifyToolOutput(result.output)
  }

  const output: JsonValue = {
    status: result.status,
    errorMessage: result.errorMessage ?? 'Action failed',
    ...(result.output === undefined ? {} : { output: result.output }),
  }

  return stringifyToolOutput(output)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export class CoreRunEngine implements RunEngine {
  private readonly store: Store
  private readonly provider: Provider
  private readonly providerCredentialResolver: ProviderCredentialResolver
  private readonly skillResolver: SkillResolver
  private readonly mcpRegistry: McpRegistry
  private readonly actionExecutor: ActionExecutor
  private readonly policy: Policy
  private readonly eventBus: EventBus
  private readonly approvalCoordinator?: ApprovalCoordinator
  private readonly hookRunner: HookRunner
  private readonly now: () => string
  private readonly createId: () => string
  private readonly maxProviderTurns: number
  private readonly dryRunPreviewBuilder: DryRunPreviewBuilder
  private readonly activeRuns = new Map<string, AbortController>()

  constructor(dependencies: RunEngineDependencies) {
    this.store = dependencies.store
    this.provider = dependencies.provider
    this.providerCredentialResolver = dependencies.providerCredentialResolver
    this.skillResolver = dependencies.skillResolver ?? new EmptySkillResolver()
    this.mcpRegistry = dependencies.mcpRegistry ?? new EmptyMcpRegistry()
    this.actionExecutor = dependencies.actionExecutor
    this.policy = dependencies.policy
    this.eventBus = dependencies.eventBus ?? noopEventBus
    this.approvalCoordinator = dependencies.approvalCoordinator
    this.hookRunner = dependencies.hookRunner ?? new PersonalRulesHookRunner()
    this.now = dependencies.now ?? defaultNow
    this.createId = dependencies.createId ?? defaultCreateId
    this.maxProviderTurns = dependencies.maxProviderTurns ?? 8
    this.dryRunPreviewBuilder = new DryRunPreviewBuilder({
      store: this.store,
      actionExecutor: this.actionExecutor,
      skillResolver: this.skillResolver,
      mcpRegistry: this.mcpRegistry,
      policy: this.policy,
      hookRunner: this.hookRunner,
      now: this.now,
    })
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
      role: input.role ?? 'build',
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
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: now,
      type: 'run.dry_run_preview',
      payload: await this.dryRunPreviewBuilder.build({ settings, run, messages: [userMessage] }),
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

        const { providerResult, streamedMessage } = await this.requestProviderTurn({
          run,
          messages,
          settings: context.settings,
          signal: context.signal,
        })
        const assistantResult = await this.persistAssistantResult({
          run,
          messages,
          providerResult,
          streamedMessage,
        })
        messages = assistantResult.messages

        if (assistantResult.providerMessageId) {
          await this.emitEvent({
            id: this.createId(),
            runId: run.id,
            timestamp: this.now(),
            type: 'provider.completed',
            payload: { messageId: assistantResult.providerMessageId },
          })
        }

        const actionRequests = providerResult.actionCalls ?? []

        if (actionRequests.length === 0) {
          await this.completeRun(run)
          return
        }

        const actionResult = await this.executeActionRequests(
          run,
          actionRequests,
          messages,
          context.settings,
          context.signal,
        )
        messages = actionResult.messages

        if (actionResult.stopped) {
          return
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

  private async requestProviderTurn(input: {
    run: Run
    messages: Message[]
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ProviderTurnResult> {
    await this.emitEvent({
      id: this.createId(),
      runId: input.run.id,
      timestamp: this.now(),
      type: 'provider.requested',
      payload: {
        provider: getProviderDefinition(input.settings.provider.provider).label,
        model: input.settings.provider.model,
      },
    })

    let streamedMessage = ''
    const actions = filterActionsForRole(await this.actionExecutor.listDefinitions(), input.run.role)
    const skills = await this.skillResolver.resolveForRun({
      settings: input.settings,
      run: input.run,
      messages: input.messages,
    })
    const memory = await this.store.recallMemory({
      query: input.messages.map((message) => message.content).join('\n'),
      settings: input.settings,
    })
    const providerDefinition = getProviderDefinition(input.settings.provider.provider)
    const providerAuth = await this.providerCredentialResolver.getProviderAuth({
      provider: input.settings.provider.provider,
    })

    if (providerDefinition.requiresApiKey && providerAuth.authMethod !== 'api-key') {
      throw new Error(`Missing API key for ${providerDefinition.label}`)
    }

    const providerResult = await this.provider.generate({
      run: input.run,
      messages: input.messages,
      actions,
      settings: input.settings,
      providerAuth,
      skills,
      memory,
      signal: input.signal,
      onDelta: async (delta) => {
        streamedMessage += delta
        await this.emitEvent({
          id: this.createId(),
          runId: input.run.id,
          timestamp: this.now(),
          type: 'provider.delta',
          payload: { delta },
        })
      },
      onReasoningDelta: async (delta) => {
        await this.emitEvent({
          id: this.createId(),
          runId: input.run.id,
          timestamp: this.now(),
          type: 'provider.reasoning_delta',
          payload: delta,
        })
      },
    })

    return { providerResult, streamedMessage }
  }

  private async persistAssistantResult(input: PersistAssistantResultInput): Promise<PersistAssistantResultOutput> {
    const assistantContent = input.providerResult.content ?? input.streamedMessage
    let providerMessageId = input.messages.at(-1)?.id
    const assistantToolCalls = input.providerResult.actionCalls?.map((actionCall) => ({
      id: actionCall.toolCallId,
      actionId: actionCall.actionId,
      input: actionCall.input,
    }))

    if (!assistantContent && (!assistantToolCalls || assistantToolCalls.length === 0)) {
      return { messages: input.messages, providerMessageId }
    }

    const assistantMessage: Message = {
      id: this.createId(),
      conversationId: input.run.conversationId,
      runId: input.run.id,
      role: 'assistant',
      content: assistantContent,
      toolCalls: assistantToolCalls,
      reasoning: input.providerResult.reasoning,
      reasoningDetails: input.providerResult.reasoningDetails,
      createdAt: this.now(),
    }

    await this.store.saveMessage(assistantMessage)
    await this.emitEvent({
      id: this.createId(),
      runId: input.run.id,
      timestamp: assistantMessage.createdAt,
      type: 'message.created',
      payload: { message: assistantMessage },
    })

    providerMessageId = assistantMessage.id

    return {
      messages: [...input.messages, assistantMessage],
      providerMessageId,
    }
  }

  private async executeActionRequests(
    run: Run,
    actionRequests: ProviderActionRequest[],
    messages: Message[],
    settings: AppSettings,
    signal: AbortSignal,
  ): Promise<ExecuteActionRequestsOutput> {
    let nextMessages = messages

    for (const actionRequest of actionRequests) {
      const actionOutput = await this.handleActionRequest(run, actionRequest, settings, signal)

      if (actionOutput === null) {
        return { messages: nextMessages, stopped: true }
      }

      nextMessages = [...nextMessages, actionOutput]
    }

    return { messages: nextMessages, stopped: false }
  }

  private async startLifecycle(run: Run): Promise<Run> {
    const startedAt = this.now()
    return this.transitionRun(run, 'started', { startedAt }, 'run.started', { startedAt })
  }

  private async completeRun(run: Run): Promise<void> {
    const finishedAt = this.now()
    await this.transitionRun(run, 'completed', { finishedAt }, 'run.completed', { finishedAt })
    await this.createPostRunMemoryProposal(run)
  }

  private async createPostRunMemoryProposal(run: Run): Promise<void> {
    const events = await this.store.listRunEvents(run.id)
    const requestedActions = events.flatMap((event) => event.type === 'action.requested' ? [event.payload.actionCall] : [])
    const editedActions = requestedActions.filter((actionCall) => actionCall.actionId === 'write_file' || actionCall.actionId === 'apply_patch')

    if (editedActions.length === 0) {
      return
    }

    const alreadyProposed = (await this.store.listMemoryProposals()).some((proposal) => proposal.runId === run.id)

    if (alreadyProposed) {
      return
    }

    const proposal: MemoryProposal = {
      id: this.createId(),
      runId: run.id,
      category: 'workflow',
      content: 'After file edits, run the relevant validation command before considering the task complete.',
      rationale: 'This run edited files; durable workflow memory is proposed for approval instead of written automatically.',
      evidence: editedActions.map((actionCall) => `${actionCall.actionId}:${actionCall.id}`),
      status: 'pending',
      createdAt: this.now(),
    }

    await this.store.saveMemoryProposal(proposal)
    await this.emitEvent({
      id: this.createId(),
      runId: run.id,
      timestamp: proposal.createdAt,
      type: 'memory.proposal_created',
      payload: { proposal },
    })
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

    const preHookStopped = await this.runToolHooks('pre_tool_use', run, actionDefinition, actionCall, settings)

    if (preHookStopped) {
      throw new Error(preHookStopped.message)
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

    const postHookStopped = await this.runToolHooks('post_tool_use', run, actionDefinition, actionCall, settings, result)

    if (postHookStopped) {
      throw new Error(postHookStopped.message)
    }

    const toolMessage: Message = {
      id: this.createId(),
      conversationId: run.conversationId,
      runId: run.id,
      role: 'tool',
      content: stringifyActionResult(result),
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

  private async runToolHooks(
    phase: HookPhase,
    run: Run,
    action: ActionDefinition,
    actionCall: ActionCall,
    settings: AppSettings,
    result?: ActionResult,
  ): Promise<HookResult | null> {
    let results: HookResult[]

    try {
      const hookIds = await this.hookRunner.listHooks(settings)

      for (const hookId of hookIds.filter((hookId) => hookId.includes(phase))) {
        await this.emitEvent({
          id: this.createId(),
          runId: run.id,
          timestamp: this.now(),
          type: 'hook.started',
          payload: { hookId, phase, actionCallId: actionCall.id },
        })
      }

      results = await this.hookRunner.runHooks({ phase, run, action, actionCall, settings, result })
    } catch (error) {
      const failedResult: HookResult = {
        hookId: 'hook_runner',
        phase,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Hook failed',
      }

      await this.emitEvent({
        id: this.createId(),
        runId: run.id,
        timestamp: this.now(),
        type: 'hook.error',
        payload: { result: failedResult },
      })
      return failedResult
    }

    for (const hookResult of results) {
      await this.emitEvent({
        id: this.createId(),
        runId: run.id,
        timestamp: this.now(),
        type: hookResult.status === 'denied' ? 'hook.denied' : hookResult.status === 'failed' ? 'hook.error' : 'hook.completed',
        payload: { result: hookResult },
      } as Extract<RunEvent, { type: 'hook.completed' | 'hook.denied' | 'hook.error' }>)

      if (hookResult.status !== 'completed') {
        return hookResult
      }
    }

    return null
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
