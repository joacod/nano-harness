import type { ActionCall, AppSettings, ApprovalRequest, ApprovalResolution, Run } from '@nano-harness/shared'

import type { ConversationSnapshot } from './store'

export interface ApprovalCoordinator {
  waitForDecision(input: {
    request: ApprovalRequest
    run: Run
    settings: AppSettings
    signal: AbortSignal
  }): Promise<ApprovalResolution>
  resolveDecision?(input: { approvalRequestId: string; decision: ApprovalResolution['decision'] }): Promise<boolean> | boolean
}

export type PendingApprovalContext = {
  request: ApprovalRequest
  actionCall: ActionCall
}

export function getLatestPendingApproval(snapshot: ConversationSnapshot): PendingApprovalContext | null {
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
