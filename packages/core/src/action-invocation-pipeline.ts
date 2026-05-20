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
  SpecArtifactKind,
  SpecEvidenceLink,
  SpecTask,
} from '@nano-harness/shared'
import { specChangeSummarySchema } from '@nano-harness/shared'

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

    if (result.status === 'completed') {
      await this.emitSpecAndObligationEvents(run, actionDefinition, actionCall, result)
      await this.satisfyValidationObligations(run, actionDefinition, actionCall, result)
    }

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

  private async emitSpecAndObligationEvents(
    run: Run,
    action: ActionDefinition,
    actionCall: ActionCall,
    result: ActionResult,
  ): Promise<void> {
    const timestamp = this.dependencies.now()
    const output = asRecord(result.output)

    if (action.id === 'write_spec_artifact') {
      const path = getStringField(output, 'path')
      const artifactKind = getStringField(output, 'artifactKind')
      const changeId = getStringField(output, 'changeId') ?? extractSpecChangeId(path)
      const change = output.change && typeof output.change === 'object' && !Array.isArray(output.change)
        ? specChangeSummarySchema.safeParse(output.change).data
        : null

      if (path && artifactKind && changeId && isSpecArtifactKind(artifactKind)) {
        if (output.changeCreated === true && change) {
          await this.dependencies.emitEvent({
            id: this.dependencies.createId(),
            runId: run.id,
            timestamp,
            type: 'spec.change_created',
            payload: { change },
          })
        }

        await this.dependencies.emitEvent({
          id: this.dependencies.createId(),
          runId: run.id,
          timestamp,
          type: 'spec.artifact_written',
          payload: { changeId, artifactKind, path },
        })
        await this.emitValidationObligation(run, actionCall, timestamp, {
          reason: `Validate spec artifact ${artifactKind} for ${changeId}.`,
          changedFiles: [path],
        })
      }
      return
    }

    if (action.id === 'update_spec_task') {
      const task = parseSpecTask(output.task)
      const changeId = getStringField(actionCall.input, 'changeId')

      if (changeId && task) {
        await this.dependencies.emitEvent({
          id: this.dependencies.createId(),
          runId: run.id,
          timestamp,
          type: 'spec.task_updated',
          payload: { changeId, task },
        })

        if (task.status === 'done') {
          await this.emitValidationObligation(run, actionCall, timestamp, {
            reason: `Validate completed spec task ${task.id}: ${task.title}.`,
            changedFiles: compactStrings([getStringField(output, 'path')]),
            validationCommands: task.validationNotes,
          })
        }
      }
      return
    }

    if (action.id === 'append_spec_evidence') {
      const changeId = getStringField(actionCall.input, 'changeId') ?? getStringField(output, 'changeId')
      const evidence = parseSpecEvidenceLink(output)

      if (changeId) {
        await this.dependencies.emitEvent({
          id: this.dependencies.createId(),
          runId: run.id,
          timestamp,
          type: 'spec.evidence_appended',
          payload: { changeId, evidence },
        })
      }
      return
    }

    if (action.id === 'archive_spec_change') {
      const changeId = getStringField(output, 'changeId')
      const archivedPath = getStringField(output, 'archivedPath')

      if (changeId && archivedPath) {
        await this.dependencies.emitEvent({
          id: this.dependencies.createId(),
          runId: run.id,
          timestamp,
          type: 'spec.change_archived',
          payload: { changeId, archivedPath },
        })
      }
      return
    }

    if (action.id === 'apply_patch' || action.id === 'write_file') {
      const path = getStringField(output, 'path')

      if (path) {
        await this.emitValidationObligation(run, actionCall, timestamp, {
          reason: `Validate edits to ${path}.`,
          changedFiles: [path],
        })
      }
    }
  }

  private async emitValidationObligation(
    run: Run,
    actionCall: ActionCall,
    timestamp: string,
    input: { reason: string; changedFiles?: string[]; validationCommands?: string[] },
  ): Promise<void> {
    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: run.id,
      timestamp,
      type: 'obligation.created',
      payload: {
        obligation: {
          id: this.dependencies.createId(),
          reason: input.reason,
          sourceActionCallIds: [actionCall.id],
          changedFiles: input.changedFiles ?? [],
          validationCommands: input.validationCommands ?? [],
          createdAt: timestamp,
        },
      },
    })
  }

  private async satisfyValidationObligations(
    run: Run,
    action: ActionDefinition,
    actionCall: ActionCall,
    result: ActionResult,
  ): Promise<void> {
    const output = asRecord(result.output)
    let evidence: string[] = []

    if (action.id === 'run_command') {
      evidence = compactStrings([
        `action:run_command:${actionCall.id}`,
        renderCommandEvidence(output),
      ])
    }

    if (action.id === 'append_spec_evidence') {
      evidence = parseSpecEvidenceLink(output).validationOutputs.map((value) => `validation:${value}`)
    }

    if (evidence.length === 0) {
      return
    }

    const openObligationIds = getOpenValidationObligationIds(await this.dependencies.store.listRunEvents(run.id))
    const timestamp = this.dependencies.now()

    for (const obligationId of openObligationIds) {
      await this.dependencies.emitEvent({
        id: this.dependencies.createId(),
        runId: run.id,
        timestamp,
        type: 'obligation.satisfied',
        payload: {
          obligationId,
          evidence,
          satisfiedAt: timestamp,
        },
      })
    }
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

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getStringField(value: Record<string, JsonValue>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field : null
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function renderCommandEvidence(output: Record<string, JsonValue>): string | null {
  const command = getStringField(output, 'command')

  if (!command) {
    return null
  }

  const args = getStringArrayField(output, 'args')
  return `command:${[command, ...args].join(' ')}`
}

export function getOpenValidationObligationIds(events: RunEvent[]): string[] {
  const openObligationIds = new Set<string>()

  for (const event of events) {
    if (event.type === 'obligation.created') {
      openObligationIds.add(event.payload.obligation.id)
    }

    if (event.type === 'obligation.satisfied' || event.type === 'obligation.unmet') {
      openObligationIds.delete(event.payload.obligationId)
    }
  }

  return [...openObligationIds]
}

function extractSpecChangeId(path: string | null): string | null {
  const match = path?.match(/^\.nano\/specs\/(?:changes|archive)\/([^/]+)\//)
  return match?.[1] ?? null
}

function isSpecArtifactKind(value: string): value is SpecArtifactKind {
  return value === 'proposal'
    || value === 'design'
    || value === 'tasks'
    || value === 'delta_spec'
    || value === 'evidence'
    || value === 'current_spec'
}

function parseSpecTask(value: JsonValue | undefined): SpecTask | null {
  const task = asRecord(value)
  const id = getStringField(task, 'id')
  const title = getStringField(task, 'title')
  const status = getStringField(task, 'status')
  const ownerRole = getStringField(task, 'ownerRole')

  if (!id || !title || !isSpecTaskStatus(status)) {
    return null
  }

  return {
    id,
    title,
    status,
    validationNotes: getStringArrayField(task, 'validationNotes'),
    ...(typeof task.sourceLine === 'number' ? { sourceLine: task.sourceLine } : {}),
    ...(isAgentRole(ownerRole) ? { ownerRole } : {}),
  }
}

function parseSpecEvidenceLink(value: Record<string, JsonValue>): SpecEvidenceLink {
  return {
    runIds: getStringArrayField(value, 'runs'),
    eventIds: getStringArrayField(value, 'events'),
    approvalIds: getStringArrayField(value, 'approvals'),
    changedFiles: getStringArrayField(value, 'changedFiles'),
    validationOutputs: getStringArrayField(value, 'validation'),
    benchmarkObservations: getStringArrayField(value, 'benchmarkObservations'),
  }
}

function getStringArrayField(value: Record<string, JsonValue>, key: string): string[] {
  const field = value[key]
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function isSpecTaskStatus(value: string | null): value is SpecTask['status'] {
  return value === 'todo' || value === 'in_progress' || value === 'done' || value === 'blocked'
}

function isAgentRole(value: string | null): value is Exclude<SpecTask['ownerRole'], undefined> {
  return value === 'plan' || value === 'build' || value === 'review'
}
