import type { SpecChangeDetail } from '../../../../../../packages/shared/src'
import { Button, FeedbackText, StatusBadge } from '../ui'
import { SpecEvidencePanel } from './SpecEvidencePanel'

export function SpecWorkflowPanel({ change }: { change: SpecChangeDetail | null }) {
  return (
    <section className="spec-workbench-column spec-workbench-workflow" aria-label="Spec workflow and evidence">
      <div className="spec-workbench-column-header">
        <p className="eyebrow">Workflow</p>
        <h2>Actions</h2>
      </div>
      {change ? (
        <div className="spec-workflow-summary">
          <strong>{change.summary.id}</strong>
          <StatusBadge status={change.summary.status}>{change.summary.status}</StatusBadge>
        </div>
      ) : null}
      <div className="spec-workflow-actions">
        <Button type="button" disabled fullWidth>Propose</Button>
        <Button type="button" disabled fullWidth>Plan</Button>
        <Button type="button" disabled fullWidth>Build selected task</Button>
        <Button type="button" disabled fullWidth>Verify</Button>
        <Button type="button" disabled fullWidth>Archive</Button>
      </div>
      <FeedbackText>
        Workflow buttons are visible in v0. Starting role-specific runs is wired in the next step.
      </FeedbackText>
      <SpecEvidencePanel change={change} />
    </section>
  )
}
