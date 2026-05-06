import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApprovalRequest, ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import { formatTimestamp } from '../utils/formatting'
import { describeRunEvent, getEventTone, getRecoverableRunAction, type StreamingRunState } from '../utils/run-events'
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
  const latestFirstEvents = [...events].reverse()
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
  const exportEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!run) {
        throw new Error('No run is selected')
      }

      return await window.desktop.exportRunEvidence({ runId: run.id })
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
              <span className="field-label">Role</span>
              <p>{run.role ?? 'build'}</p>
            </div>
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

          <div className="run-controls">
            <Button type="button" disabled={exportEvidenceMutation.isPending} onClick={() => exportEvidenceMutation.mutate()}>
              {exportEvidenceMutation.isPending ? 'Exporting...' : 'Export evidence'}
            </Button>
          </div>
          {exportEvidenceMutation.data ? (
            <FeedbackText live>
              Exported evidence to {exportEvidenceMutation.data.exportedFilePath}
            </FeedbackText>
          ) : null}
          {exportEvidenceMutation.error instanceof Error ? (
            <FeedbackText variant="error" live>
              {exportEvidenceMutation.error.message}
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

          {events.length === 0 ? <FeedbackText>No events captured for this run yet.</FeedbackText> : null}

          <ol className="timeline-list" aria-label="Signal trace, latest first">
            {latestFirstEvents.map((event) => {
              const description = describeRunEvent(event)

              return (
                <li key={event.id} className="timeline-item">
                  <div className={`timeline-dot timeline-${getEventTone(event)}`} />
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
