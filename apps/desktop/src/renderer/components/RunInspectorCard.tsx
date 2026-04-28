import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApprovalRequest, ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import { formatTimestamp } from '../utils/formatting'
import { describeRunEvent, getEventFamily, getRecoverableRunAction, type StreamingRunState } from '../utils/run-events'
import { Button, Card, FeedbackText, StatusBadge } from './ui'

export function RunInspectorCard({
  run,
  events,
  pendingApproval,
  streamingState,
}: {
  run: ConversationSnapshot['runs'][number] | null
  events: RunEvent[]
  pendingApproval: ApprovalRequest | null
  streamingState: StreamingRunState | null
}) {
  const queryClient = useQueryClient()
  const recoverableAction = run ? getRecoverableRunAction(run, pendingApproval) : null
  const runControlMutation = useMutation({
    mutationFn: async (action: 'resume' | 'cancel') => {
      if (!run) {
        throw new Error('No run is selected')
      }

      if (action === 'resume') {
        await window.desktop.resumeRun({ runId: run.id })
        return
      }

      await window.desktop.cancelRun({ runId: run.id })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversation'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
  const approvalMutation = useMutation({
    mutationFn: async (decision: 'granted' | 'rejected') => {
      if (!run || !pendingApproval) {
        throw new Error('No pending approval is available')
      }

      await window.desktop.resolveApproval({
        runId: run.id,
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
    <Card className="inspector-card">
      <p className="eyebrow">Inspector</p>
      <div className="sidebar-header-row">
        <h2>{run ? 'Signal trace' : 'Select a run'}</h2>
        {run ? (
          <div className="status-row">
            <StatusBadge status={run.status}>{run.status}</StatusBadge>
            {streamingState?.isStreaming ? <StatusBadge status="streaming">streaming</StatusBadge> : null}
          </div>
        ) : null}
      </div>

      {run && (recoverableAction || run.status === 'started' || run.status === 'waiting_approval') ? (
        <div className="run-controls">
          {recoverableAction ? (
            <Button
              type="button"
              disabled={runControlMutation.isPending}
              onClick={() => runControlMutation.mutate('resume')}
            >
              {runControlMutation.isPending ? 'Working…' : 'Resume run'}
            </Button>
          ) : null}
          {run.status === 'created' || run.status === 'started' || run.status === 'waiting_approval' ? (
            <Button
              type="button"
              disabled={runControlMutation.isPending}
              onClick={() => runControlMutation.mutate('cancel')}
            >
              Cancel run
            </Button>
          ) : null}
        </div>
      ) : null}

      {!run ? <FeedbackText>Choose a run to inspect its persisted and live event sequence.</FeedbackText> : null}

      {run ? (
        <>
          <div className="inspector-summary">
            <div>
              <span className="field-label">Created</span>
              <p>{formatTimestamp(run.createdAt)}</p>
            </div>
            <div>
              <span className="field-label">Started</span>
              <p>{run.startedAt ? formatTimestamp(run.startedAt) : 'Not started yet'}</p>
            </div>
            <div>
              <span className="field-label">Finished</span>
              <p>{run.finishedAt ? formatTimestamp(run.finishedAt) : 'Still active'}</p>
            </div>
          </div>

          {run.failureMessage ? (
            <FeedbackText variant="error" live>
              {run.failureMessage}
            </FeedbackText>
          ) : null}
          {!run.failureMessage && streamingState?.errorMessage ? (
            <FeedbackText variant="error" live>
              {streamingState.errorMessage}
            </FeedbackText>
          ) : null}
          {runControlMutation.error instanceof Error ? (
            <FeedbackText variant="error" live>
              {runControlMutation.error.message}
            </FeedbackText>
          ) : null}

          {pendingApproval ? (
            <section className="approval-card">
              <div className="sidebar-header-row">
                <div>
                  <p className="eyebrow">Approval</p>
                  <h3>Action requires confirmation</h3>
                </div>
                <StatusBadge status="waiting_approval">pending</StatusBadge>
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
                  {approvalMutation.isPending ? 'Submitting…' : 'Grant approval'}
                </Button>
              </div>
              {approvalMutation.error instanceof Error ? (
                <FeedbackText variant="error" live>
                  {approvalMutation.error.message}
                </FeedbackText>
              ) : null}
            </section>
          ) : null}

          {events.length === 0 ? <FeedbackText>No events captured for this run yet.</FeedbackText> : null}

          <ol className="timeline-list">
            {events.map((event) => {
              const description = describeRunEvent(event)

              return (
                <li key={event.id} className="timeline-item">
                  <div className={`timeline-dot timeline-${getEventFamily(event.type)}`} />
                  <div className="timeline-card">
                    <div className="timeline-header">
                      <strong>{description.title}</strong>
                      <small>{formatTimestamp(event.timestamp)}</small>
                    </div>
                    <p className="timeline-type">{event.type}</p>
                    <FeedbackText>{description.detail}</FeedbackText>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}
    </Card>
  )
}
