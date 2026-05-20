import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import type { SpecChangeDetail } from '../../../../../../packages/shared/src'
import { specArtifactQueryOptions } from '../../queries'
import { FeedbackText, StatusBadge } from '../ui'

export function SpecEvidencePanel({ change }: { change: SpecChangeDetail | null }) {
  const evidenceArtifactQuery = useQuery(specArtifactQueryOptions({
    changeId: change?.summary.id,
    artifactKind: 'evidence',
    enabled: Boolean(change),
  }))

  if (!change) {
    return <FeedbackText>Select a change to view linked evidence.</FeedbackText>
  }

  const missingEvidence = getMissingEvidence(change)
  const evidenceArtifact = parseEvidenceArtifact(evidenceArtifactQuery.data?.content)
  const unmetObligations = getUnmetObligations(change, evidenceArtifact)

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
      <EvidenceSection title="Linked runs" values={change.evidenceLinks.runIds} renderValue={(value) => (
        <a className="ghost-link spec-evidence-link" href={`/conversations/${encodeURIComponent(value)}`}>{value}</a>
      )} />
      <EvidenceSection title="Approvals" values={change.evidenceLinks.approvalIds} />
      <EvidenceSection title="Changed files" values={change.evidenceLinks.changedFiles} mono />
      <EvidenceSection title="Validation" values={change.evidenceLinks.validationOutputs} />
      <EvidenceSection title="Unmet obligations" values={unmetObligations} />
      <EvidenceSection title="Benchmarks" values={change.evidenceLinks.benchmarkObservations} />
      {evidenceArtifact?.draftPr ? (
        <div className="spec-evidence-section">
          <strong>Draft PR artifact</strong>
          <pre className="spec-evidence-draft-pr">{JSON.stringify(evidenceArtifact.draftPr, null, 2)}</pre>
        </div>
      ) : null}
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

type EvidenceArtifact = {
  draftPr?: unknown
  validation?: string[]
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

function getUnmetObligations(change: SpecChangeDetail, evidenceArtifact: EvidenceArtifact | null): string[] {
  const candidates = [
    ...change.evidenceLinks.validationOutputs,
    ...(evidenceArtifact?.validation ?? []),
  ]

  return candidates.filter((value) => /unmet obligation|obligation\.unmet|unmet:/iu.test(value))
}

function parseEvidenceArtifact(content: string | undefined): EvidenceArtifact | null {
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const validation = Array.isArray(parsed.validation)
      ? parsed.validation.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined

    return {
      ...(validation ? { validation } : {}),
      ...(parsed.draftPr ? { draftPr: parsed.draftPr } : {}),
    }
  } catch {
    return null
  }
}

function EvidenceSection({ title, values, mono = false, renderValue }: {
  title: string
  values: string[]
  mono?: boolean
  renderValue?: (value: string) => ReactNode
}) {
  return (
    <div className="spec-evidence-section">
      <strong>{title}</strong>
      {values.length > 0 ? (
        <ul>
          {values.map((value) => <li key={value} className={mono ? 'spec-evidence-mono' : undefined}>{renderValue ? renderValue(value) : value}</li>)}
        </ul>
      ) : (
        <FeedbackText>No {title.toLowerCase()} recorded yet.</FeedbackText>
      )}
    </div>
  )
}
