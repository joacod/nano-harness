import type { ActionCall, AppSettings, ApprovalRequest, ApprovalResolution, Run, RunEvent, RunStatus } from '@nano-harness/shared'

import type { ApprovalCoordinator, PendingApprovalContext } from './approvals'
import type { Store } from './store'

export class ApprovalRejectedAbortError extends Error {
  constructor() {
    super('Approval rejected')
    this.name = 'AbortError'
  }
}

export interface ApprovalGateDependencies {
  store: Store
  approvalCoordinator?: ApprovalCoordinator
  now: () => string
  createId: () => string
  emitEvent: (event: RunEvent) => Promise<void>
  transitionRun: (
    run: Run,
    nextStatus: RunStatus,
    update: { startedAt?: string; finishedAt?: string; failureMessage?: string } | undefined,
    eventType: Extract<RunEvent['type'], `run.${string}`>,
    payload: Record<string, unknown>,
  ) => Promise<Run>
  cancelRun: (run: Run, reason: string) => Promise<void>
}

export class ApprovalGate {
  constructor(private readonly dependencies: ApprovalGateDependencies) {}

  async requestApproval(input: {
    run: Run
    actionCall: ActionCall
    reason: string
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ApprovalResolution> {
    if (!this.dependencies.approvalCoordinator) {
      throw new Error('Approval required but no approval coordinator is configured')
    }

    const request: ApprovalRequest = {
      id: this.dependencies.createId(),
      runId: input.run.id,
      actionCallId: input.actionCall.id,
      reason: input.reason,
      requestedAt: this.dependencies.now(),
    }

    await this.dependencies.store.saveApprovalRequest(request)
    await this.dependencies.transitionRun(input.run, 'waiting_approval', undefined, 'run.waiting_approval', {
      approvalRequestId: request.id,
    })
    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: input.run.id,
      timestamp: request.requestedAt,
      type: 'approval.required',
      payload: { approvalRequest: request },
    })

    const resolution = await this.dependencies.approvalCoordinator.waitForDecision({
      request,
      run: { ...input.run, status: 'waiting_approval' },
      settings: input.settings,
      signal: input.signal,
    })

    return this.persistResolution(input.run, resolution)
  }

  async persistResolution(run: Run, resolution: ApprovalResolution): Promise<ApprovalResolution> {
    await this.dependencies.store.saveApprovalResolution(resolution)
    await this.dependencies.emitEvent({
      id: this.dependencies.createId(),
      runId: run.id,
      timestamp: resolution.decidedAt,
      type: resolution.decision === 'granted' ? 'approval.granted' : 'approval.rejected',
      payload: { resolution },
    })

    if (resolution.decision === 'granted') {
      await this.dependencies.transitionRun(run, 'started', undefined, 'run.started', {
        startedAt: this.dependencies.now(),
      })
    }

    return resolution
  }

  async resumeFromPendingApproval(input: {
    run: Run
    pendingApproval: PendingApprovalContext
    settings: AppSettings
    approvalResolutions: ApprovalResolution[]
    signal: AbortSignal
  }): Promise<Run> {
    const existingResolution = input.approvalResolutions.find(
      (resolution) => resolution.approvalRequestId === input.pendingApproval.request.id,
    )

    const resolution = existingResolution ?? await this.waitForPendingApprovalDecision(
      input.run,
      input.pendingApproval.request,
      input.settings,
      input.signal,
    )

    if (resolution.decision === 'rejected') {
      await this.dependencies.cancelRun(input.run, `approval rejected for ${input.pendingApproval.actionCall.actionId}`)
      throw new ApprovalRejectedAbortError()
    }

    return {
      ...input.run,
      status: 'started',
    }
  }

  private async waitForPendingApprovalDecision(
    run: Run,
    request: ApprovalRequest,
    settings: AppSettings,
    signal: AbortSignal,
  ): Promise<ApprovalResolution> {
    if (!this.dependencies.approvalCoordinator) {
      throw new Error('Approval required but no approval coordinator is configured')
    }

    const resolution = await this.dependencies.approvalCoordinator.waitForDecision({
      request,
      run,
      settings,
      signal,
    })

    return this.persistResolution(run, resolution)
  }
}
