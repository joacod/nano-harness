import type { MemoryCategory, MemoryProposalList, MemoryRecordList } from '../../../../../../packages/shared/src'
import { formatTimestamp } from '../../utils/formatting'
import { Button, FeedbackText } from '../ui'

export function MemoryInspectorCard({
  records,
  proposals,
  isResolving,
  error,
  onResolveProposal,
}: {
  records: MemoryRecordList | null
  proposals: MemoryProposalList | null
  isResolving: boolean
  error: string | null
  onResolveProposal: (input: { proposalId: string; decision: 'approved' | 'rejected' }) => Promise<void>
}) {
  const pendingProposals = proposals?.proposals.filter((proposal) => proposal.status === 'pending') ?? []

  return (
    <div className="settings-tab-stack">
      <section className="settings-section" aria-labelledby="memory-proposals-heading">
        <div className="settings-section-heading">
          <p className="eyebrow" id="memory-proposals-heading">Memory Proposals</p>
          <p>Review durable memory suggestions before they are written to approved memory.</p>
        </div>

        {pendingProposals.length === 0 ? <FeedbackText>No pending memory proposals.</FeedbackText> : null}
        {pendingProposals.map((proposal) => (
          <article className="memory-item" key={proposal.id}>
            <div>
              <span className="field-label">{formatMemoryCategory(proposal.category)}</span>
              <p>{proposal.content}</p>
              <small className="muted-copy">{proposal.rationale}</small>
              <small className="muted-copy">Evidence: {proposal.evidence.join(', ')}</small>
            </div>
            <div className="approval-actions">
              <Button type="button" size="sm" disabled={isResolving} onClick={() => void onResolveProposal({ proposalId: proposal.id, decision: 'rejected' })}>Reject</Button>
              <Button type="button" size="sm" variant="primary" disabled={isResolving} onClick={() => void onResolveProposal({ proposalId: proposal.id, decision: 'approved' })}>Approve</Button>
            </div>
          </article>
        ))}
        {error ? <FeedbackText variant="error" live>{error}</FeedbackText> : null}
      </section>

      <section className="settings-section" aria-labelledby="approved-memory-heading">
        <div className="settings-section-heading">
          <p className="eyebrow" id="approved-memory-heading">Approved Memory</p>
          <p>Memory snippets recalled across sessions with provenance.</p>
        </div>
        {!records?.records.length ? <FeedbackText>No approved memory yet.</FeedbackText> : null}
        {records?.records.map((record) => (
          <article className="memory-item" key={record.id}>
            <span className="field-label">{formatMemoryCategory(record.category)}</span>
            <p>{record.content}</p>
            <small className="muted-copy">Source: {record.source} · Updated {formatTimestamp(record.updatedAt)} · Confidence {record.confidence}</small>
          </article>
        ))}
      </section>
    </div>
  )
}

function formatMemoryCategory(category: MemoryCategory): string {
  switch (category) {
    case 'preference':
      return 'Preference'
    case 'project_fact':
      return 'Project fact'
    case 'workflow':
      return 'Workflow'
    case 'benchmark_observation':
      return 'Benchmark observation'
    case 'skill_improvement':
      return 'Skill improvement'
    case 'harness_improvement_signal':
      return 'Harness improvement signal'
  }
}
