import type { ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import { formatTimestamp } from '../utils/formatting'
import { getProviderRequestForRun } from '../utils/run-events'

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
    <section className="panel-card inspector-card">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Runs</p>
          <h2>Conversation history</h2>
        </div>
        <span className="runtime-pill">{runs.length} total</span>
      </div>

      {sortedRuns.length === 0 ? <p className="muted-copy">No runs yet for this conversation.</p> : null}

      <div className="run-list">
        {sortedRuns.map((run) => {
          const providerRequest = getProviderRequestForRun(events, run.id)

          return (
            <button
              key={run.id}
              type="button"
              className={`run-card ${selectedRunId === run.id ? 'run-card-active' : ''}`}
              onClick={() => onSelectRun(run.id)}
            >
              <div className="run-card-header">
                <strong>{run.status}</strong>
                <span className={`status-badge status-${run.status}`}>{run.status}</span>
              </div>
              <small>{formatTimestamp(run.createdAt)}</small>
              {providerRequest ? <span className="run-provider-label">{providerRequest.payload.provider}</span> : null}
              {providerRequest ? <span className="muted-copy">{providerRequest.payload.model}</span> : null}
              {run.failureMessage ? (
                <span className="error-copy" aria-live="polite">
                  {run.failureMessage}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
