import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApprovalRequest } from '../../../../../../packages/shared/src'
import { formatTimestamp } from '../../utils/formatting'
import { Button, FeedbackText, StatusBadge } from '../ui'

export function ApprovalPrompt({ pendingApproval }: { pendingApproval: ApprovalRequest }) {
  const queryClient = useQueryClient()
  const approvalMutation = useMutation({
    mutationFn: async (decision: 'granted' | 'rejected') => {
      await window.desktop.resolveApproval({
        runId: pendingApproval.runId,
        approvalRequestId: pendingApproval.id,
        decision,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversation'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  return (
    <section className="approval-card chat-approval-card" aria-live="polite">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Approval needed</p>
          <h3>Confirm to continue</h3>
        </div>
        <StatusBadge status="waiting_approval">waiting</StatusBadge>
      </div>
      <FeedbackText>{pendingApproval.reason}</FeedbackText>
      <small className="muted-copy">Requested at {formatTimestamp(pendingApproval.requestedAt)}</small>
      <div className="approval-actions">
        <Button
          type="button"
          disabled={approvalMutation.isPending}
          onClick={() => approvalMutation.mutate('rejected')}
        >
          Reject
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={approvalMutation.isPending}
          onClick={() => approvalMutation.mutate('granted')}
        >
          {approvalMutation.isPending ? 'Submitting...' : 'Grant approval'}
        </Button>
      </div>
      {approvalMutation.error instanceof Error ? (
        <FeedbackText variant="error" live>
          {approvalMutation.error.message}
        </FeedbackText>
      ) : null}
    </section>
  )
}
