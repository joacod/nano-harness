import type { SessionCompactionList } from '../../../../../packages/shared/src'
import { Card, FeedbackText } from './ui'

export function SessionCompactionCard({
  compactions,
  isCompacting,
  onCompactSession,
}: {
  compactions: SessionCompactionList | null
  isCompacting: boolean
  onCompactSession: () => void
}) {
  const records = compactions?.compactions ?? []

  return (
    <Card>
      <div className="timeline-header">
        <div>
          <p className="eyebrow">Context</p>
          <h3>Session compaction</h3>
        </div>
        <button type="button" className="secondary-button" disabled={isCompacting} onClick={onCompactSession}>
          {isCompacting ? 'Compacting…' : 'Compact now'}
        </button>
      </div>
      <FeedbackText>
        Compactions are local summary records for long sessions. They do not edit the transcript.
      </FeedbackText>
      {records.length === 0 ? <FeedbackText>No compactions yet.</FeedbackText> : null}
      {records.length > 0 ? (
        <ol className="timeline-list" aria-label="Session compactions">
          {records.slice(0, 3).map((record) => (
            <li key={record.id} className="timeline-card">
              <div className="timeline-header">
                <strong>{formatDate(record.createdAt)}</strong>
                <span className="timeline-type">{record.sourceMessageCount} messages</span>
              </div>
              <p className="muted-copy session-compaction-summary">{record.summary}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
