import type { ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import { formatTimestamp } from '../utils/formatting'
import { getProviderRequestForRun } from '../utils/run-events'
import { Button, Card, FeedbackText, RuntimePill, StatusBadge, cn } from './ui'

export function RunListCard({
  runs,
  events,
  selectedRunId,
  onSelectRun,
}: {
  runs: ConversationSnapshot['runs']
  events: RunEvent[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  const sortedRuns = [...runs].reverse()

  return (
    <Card className="inspector-card run-list-card">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Runs</p>
          <h2>Session telemetry</h2>
        </div>
        <RuntimePill>{runs.length} total</RuntimePill>
      </div>

      {sortedRuns.length === 0 ? <FeedbackText>No runs yet for this conversation.</FeedbackText> : null}

      <div className="run-list">
        {sortedRuns.map((run) => {
          const providerRequest = getProviderRequestForRun(events, run.id)

          return (
            <Button
              key={run.id}
              type="button"
              fullWidth
              aria-pressed={selectedRunId === run.id}
              className={cn('run-card', selectedRunId === run.id && 'run-card-active')}
              onClick={() => onSelectRun(run.id)}
            >
              <div className="run-card-header">
                <strong>{run.status}</strong>
                <StatusBadge status={run.status}>{run.status}</StatusBadge>
              </div>
              <small>{formatTimestamp(run.createdAt)}</small>
              {providerRequest ? <span className="run-provider-label">{providerRequest.payload.provider}</span> : null}
              {providerRequest ? <span className="muted-copy">{providerRequest.payload.model}</span> : null}
              {run.failureMessage ? (
                <span className="error-copy" aria-live="polite">
                  {run.failureMessage}
                </span>
              ) : null}
            </Button>
          )
        })}
      </div>
    </Card>
  )
}
