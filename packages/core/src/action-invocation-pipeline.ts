import type {
  ActionCall,
  ActionDefinition,
  ActionResult,
  AppSettings,
  ApprovalResolution,
  HookPhase,
  HookResult,
  JsonValue,
  Message,
  Run,
  RunEvent,
} from '@nano-harness/shared'

import type { ActionExecutor } from './actions'
import type { HookRunner } from './hooks'
import type { Policy } from './policy'
import type { ProviderActionRequest } from './provider'
import type { Store } from './store'

export type ExecuteActionRequestsOutput = {
  messages: Message[]
  stopped: boolean
}

export interface ActionInvocationPipelineDependencies {
  store: Store
  actionExecutor: ActionExecutor
  policy: Policy
  hookRunner: HookRunner
  now: () => string
  createId: () => string
  emitEvent: (event: RunEvent) => Promise<void>
  requireApproval: (input: {
    run: Run
    actionCall: ActionCall
    reason: string
    settings: AppSettings
    signal: AbortSignal
  }) => Promise<ApprovalResolution>
  cancelRun: (run: Run, reason: string) => Promise<void>
}

export class ActionInvocationPipeline {
  constructor(private readonly dependencies: ActionInvocationPipelineDependencies) {}

  async executeRequests(input: {
    run: Run
    actionRequests: ProviderActionRequest[]
    messages: Message[]
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ExecuteActionRequestsOutput> {
    let nextMessages = input.messages

    for (const actionRequest of input.actionRequests) {
      const actionOutput = await this.handleActionRequest(input.run, actionRequest, input.settings, input.signal)

      if (actionOutput === null) {
        return { messages: nextMessages, stopped: true }
      }

      nextMessages = [...nextMessages, actionOutput]
    }

    return { messages: nextMessages, stopped: false }
  }

  private async handleActionRequest(
    run: Run,
    actionRequest: ProviderActionRequest,
    settings: AppSettings,
    signal: AbortSignal,
  ): Promise<Message | null> {
    const actionDefinition = await this.dependencies.actionExecutor.getDefinition(actionRequest.actionId)

    if (!actionDefinition) {
      throw new Error(`Unknown action ${actionRequest.actionId}`)
    }

    const actionCall: ActionCall = {
      id: this.dependencies.createId(),
      runId: run.id,
      actionId: actionRequest.actionId,
      input: actionRequest.input,
      requestedAt: this.dependencies.now(),
    }

    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: run.id,
      timestamp: actionCall.requestedAt,
      type: 'action.requested',
      payload: { actionCall },
    })

    const policyDecision = await this.dependencies.policy.evaluateAction({
      run,
      action: actionDefinition,
      actionCall,
      settings,
    })

    if (policyDecision.effect === 'deny') {
      throw new Error(policyDecision.reason ?? `Action ${actionDefinition.id} is denied by policy`)
    }

    if (policyDecision.effect === 'require_approval') {
      const resolution = await this.dependencies.requireApproval({
        run,
        actionCall,
        reason: policyDecision.reason ?? `Approval required for ${actionDefinition.title}`,
        settings,
        signal,
      })

      if (resolution.decision === 'rejected') {
        await this.dependencies.cancelRun(run, `approval rejected for ${actionDefinition.id}`)
        return null
      }
    }

    const preHookStopped = await this.runToolHooks('pre_tool_use', run, actionDefinition, actionCall, settings)

    if (preHookStopped) {
      throw new Error(preHookStopped.message)
    }

    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: run.id,
      timestamp: this.dependencies.now(),
      type: 'action.started',
      payload: { actionCallId: actionCall.id },
    })

    const result = await this.dependencies.actionExecutor.execute({
      run,
      action: actionDefinition,
      call: actionCall,
      settings,
      signal,
    })

    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: run.id,
      timestamp: this.dependencies.now(),
      type: result.status === 'completed' ? 'action.completed' : 'action.failed',
      payload: { result },
    })

    const postHookStopped = await this.runToolHooks('post_tool_use', run, actionDefinition, actionCall, settings, result)

    if (postHookStopped) {
      throw new Error(postHookStopped.message)
    }

    const toolMessage: Message = {
      id: this.dependencies.createId(),
      conversationId: run.conversationId,
      runId: run.id,
      role: 'tool',
      content: stringifyActionResult(result),
      toolCallId: actionRequest.toolCallId,
      toolName: actionRequest.actionId,
      createdAt: this.dependencies.now(),
    }

    await this.dependencies.store.saveMessage(toolMessage)
    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
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
      const hookIds = await this.dependencies.hookRunner.listHooks(settings)

      for (const hookId of hookIds.filter((hookId) => hookId.includes(phase))) {
        await this.dependencies.emitEvent({
          id: this.dependencies.createId(),
          runId: run.id,
          timestamp: this.dependencies.now(),
          type: 'hook.started',
          payload: { hookId, phase, actionCallId: actionCall.id },
        })
      }

      results = await this.dependencies.hookRunner.runHooks({ phase, run, action, actionCall, settings, result })
    } catch (error) {
      const failedResult: HookResult = {
        hookId: 'hook_runner',
        phase,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Hook failed',
      }

      await this.dependencies.emitEvent({
        id: this.dependencies.createId(),
        runId: run.id,
        timestamp: this.dependencies.now(),
        type: 'hook.error',
        payload: { result: failedResult },
      })
      return failedResult
    }

    for (const hookResult of results) {
      await this.dependencies.emitEvent({
        id: this.dependencies.createId(),
        runId: run.id,
        timestamp: this.dependencies.now(),
        type: hookResult.status === 'denied' ? 'hook.denied' : hookResult.status === 'failed' ? 'hook.error' : 'hook.completed',
        payload: { result: hookResult },
      } as Extract<RunEvent, { type: 'hook.completed' | 'hook.denied' | 'hook.error' }>)

      if (hookResult.status !== 'completed') {
        return hookResult
      }
    }

    return null
  }
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
