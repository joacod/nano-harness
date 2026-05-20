import type { SpecChangeDetail } from '../../../../../../packages/shared/src'
import { FeedbackText, StatusBadge } from '../ui'

export function SpecEvidencePanel({ change }: { change: SpecChangeDetail | null }) {
  if (!change) {
    return <FeedbackText>Select a change to view linked evidence.</FeedbackText>
  }

  const missingEvidence = getMissingEvidence(change)

  return (
    <div className="spec-evidence-stack" aria-label="Spec evidence summary">
      <div className="spec-evidence-section">
        <strong>Evidence readiness</strong>
        {missingEvidence.length > 0 ? (
          <FeedbackText variant="warning">
            Missing key evidence: {missingEvidence.join(', ')}.
          </FeedbackText>
        ) : (
          <FeedbackText>Key evidence is linked for this change.</FeedbackText>
        )}
      </div>
      <EvidenceSection title="Linked runs" values={change.evidenceLinks.runIds} />
      <EvidenceSection title="Approvals" values={change.evidenceLinks.approvalIds} />
      <EvidenceSection title="Changed files" values={change.evidenceLinks.changedFiles} />
      <EvidenceSection title="Validation" values={change.evidenceLinks.validationOutputs} />
      <EvidenceSection title="Benchmarks" values={change.evidenceLinks.benchmarkObservations} />
      {change.tasks.length > 0 ? (
        <div className="spec-evidence-section">
          <strong>Tasks</strong>
          <div className="spec-task-list">
            {change.tasks.map((task) => (
              <div key={task.id} className="spec-task-row">
                <span>{task.id}: {task.title}</span>
                <StatusBadge status={task.status}>{task.status}</StatusBadge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getMissingEvidence(change: SpecChangeDetail): string[] {
  const missing: string[] = []

  if (change.evidenceLinks.runIds.length === 0 && change.summary.linkedRunIds.length === 0) {
    missing.push('linked runs')
  }

  if (change.evidenceLinks.changedFiles.length === 0) {
    missing.push('changed files')
  }

  if (change.evidenceLinks.validationOutputs.length === 0) {
    missing.push('validation output')
  }

  return missing
}

function EvidenceSection({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="spec-evidence-section">
      <strong>{title}</strong>
      {values.length > 0 ? (
        <ul>
          {values.map((value) => <li key={value}>{value}</li>)}
        </ul>
      ) : (
        <FeedbackText>No {title.toLowerCase()} recorded yet.</FeedbackText>
      )}
    </div>
  )
}
