import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApprovalRequest, ConversationSnapshot, ExportRunEvidenceResult, MemoryProposalList, MemoryRecordList, RunEvent } from '../../../../../packages/shared/src'
import { formatPreciseTimestamp, formatTimestamp } from '../utils/formatting'
import { describeRunEvent, getEventTone, getRecoverableRunAction, type StreamingRunState } from '../utils/run-events'
import { Button, Card, FeedbackText, StatusBadge } from './ui'

export function RunInspectorCard({
  run,
  events,
  pendingApproval,
  streamingState,
  onEvidenceExported,
  onEvidenceExportError,
  memoryRecords = null,
  memoryProposals = null,
}: {
  run: ConversationSnapshot['runs'][number] | null
  events: RunEvent[]
  pendingApproval: ApprovalRequest | null
  streamingState: StreamingRunState | null
  onEvidenceExported: (result: ExportRunEvidenceResult) => void
  onEvidenceExportError: (error: unknown) => void
  memoryRecords?: MemoryRecordList | null
  memoryProposals?: MemoryProposalList | null
}) {
  const queryClient = useQueryClient()
  const recoverableAction = run ? getRecoverableRunAction(run, pendingApproval) : null
  const latestFirstEvents = [...events].reverse()
  const dryRunMemory = getLatestDryRunMemory(events)
  const recalledMemory = memoryRecords?.records.slice(0, 3) ?? []
  const pendingMemoryProposals = memoryProposals?.proposals
    .filter((proposal) => proposal.status === 'pending' && proposal.runId === run?.id)
    .slice(0, 3) ?? []
  const validationObligations = getValidationObligationSummary(events)
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
    onSuccess: onEvidenceExported,
    onError: onEvidenceExportError,
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
              <p>{formatPreciseTimestamp(run.createdAt)}</p>
            </div>
            <div>
              <span className="field-label">Started</span>
              <p>{run.startedAt ? formatPreciseTimestamp(run.startedAt) : 'Not started yet'}</p>
            </div>
            <div>
              <span className="field-label">Finished</span>
              <p>{run.finishedAt ? formatPreciseTimestamp(run.finishedAt) : 'Still active'}</p>
            </div>
          </div>

          <div className="run-controls">
            <Button type="button" disabled={exportEvidenceMutation.isPending} onClick={() => exportEvidenceMutation.mutate()}>
              {exportEvidenceMutation.isPending ? 'Exporting...' : 'Export evidence'}
            </Button>
          </div>
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

          {dryRunMemory.length > 0 ? (
            <section className="inspector-dry-run-memory" aria-labelledby="inspector-dry-run-memory-heading">
              <div className="inspector-section-heading">
                <p className="eyebrow" id="inspector-dry-run-memory-heading">Dry-Run Memory</p>
                <p>Memory selected for this run before the provider call, with provenance.</p>
              </div>
              <div className="inspector-memory-group">
                {dryRunMemory.map((record) => (
                  <article className="memory-item" key={record.id}>
                    <span className="field-label">{record.category}</span>
                    <p>{record.content}</p>
                    <small className="muted-copy">
                      Source: {record.source}{record.runId ? ` · Run ${record.runId}` : ''} · Confidence {formatConfidence(record.confidence)}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="inspector-memory-context" aria-labelledby="inspector-memory-heading">
            <div className="inspector-section-heading">
              <p className="eyebrow" id="inspector-memory-heading">Memory</p>
              <p>Recalled context and pending suggestions produced by this run.</p>
            </div>
            {recalledMemory.length === 0 && pendingMemoryProposals.length === 0 ? (
              <FeedbackText>No recalled memory or pending suggestions.</FeedbackText>
            ) : null}
            {recalledMemory.length > 0 ? (
              <div className="inspector-memory-group">
                <span className="field-label">Recalled</span>
                {recalledMemory.map((record) => (
                  <article className="memory-item" key={record.id}>
                    <span className="field-label">{record.category}</span>
                    <p>{record.content}</p>
                    <small className="muted-copy">Source: {record.source} · Updated {formatTimestamp(record.updatedAt)}</small>
                  </article>
                ))}
              </div>
            ) : null}
            {pendingMemoryProposals.length > 0 ? (
              <div className="inspector-memory-group">
                <span className="field-label">Pending Suggestions</span>
                {pendingMemoryProposals.map((proposal) => (
                  <article className="memory-item" key={proposal.id}>
                    <span className="field-label">{proposal.category}</span>
                    <p>{proposal.content}</p>
                    <small className="muted-copy">Evidence: {proposal.evidence.join(', ')}</small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          {validationObligations.total > 0 ? (
            <section className="inspector-validation-context" aria-labelledby="inspector-validation-heading">
              <div className="inspector-section-heading">
                <p className="eyebrow" id="inspector-validation-heading">Validation Obligations</p>
                <p>Tracked validation state for edits and spec mutations in this run.</p>
              </div>
              <div className="validation-obligation-row">
                <StatusBadge status={validationObligations.open > 0 ? 'waiting_approval' : 'completed'}>
                  {validationObligations.open} open
                </StatusBadge>
                <StatusBadge status="completed">{validationObligations.satisfied} satisfied</StatusBadge>
                <StatusBadge status={validationObligations.unmet > 0 ? 'failed' : 'completed'}>
                  {validationObligations.unmet} unmet
                </StatusBadge>
              </div>
            </section>
          ) : null}

          {events.length === 0 ? <FeedbackText>No events captured for this run yet.</FeedbackText> : null}

          <ol className="timeline-list" aria-label="Signal trace, latest first">
            {latestFirstEvents.map((event) => {
              const description = describeRunEvent(event)
              const specChangeId = getSpecEventChangeId(event)

              return (
                <li key={event.id} className="timeline-item">
                  <div className={`timeline-dot timeline-${getEventTone(event)}`} />
                  <div className="timeline-card">
                    <div className="timeline-header">
                      <strong>{description.title}</strong>
                    </div>
                    <small className="timeline-timestamp">{formatPreciseTimestamp(event.timestamp)}</small>
                    <p className="timeline-type">{event.type}</p>
                    <FeedbackText className="timeline-detail">{description.detail}</FeedbackText>
                    {specChangeId ? (
                      <a className="ghost-link timeline-link" href={`/specs/${encodeURIComponent(specChangeId)}`}>
                        Open in Specs
                      </a>
                    ) : null}
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

function getLatestDryRunMemory(events: RunEvent[]) {
  return [...events]
    .reverse()
    .find((event): event is Extract<RunEvent, { type: 'run.dry_run_preview' }> => event.type === 'run.dry_run_preview')
    ?.payload.memory.selected.slice(0, 5) ?? []
}

function formatConfidence(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, style: 'percent' }).format(value)
}

function getSpecEventChangeId(event: RunEvent): string | null {
  switch (event.type) {
    case 'spec.change_created':
      return event.payload.change.id
    case 'spec.artifact_written':
    case 'spec.task_updated':
    case 'spec.evidence_appended':
    case 'spec.change_archived':
      return event.payload.changeId
    default:
      return null
  }
}

function getValidationObligationSummary(events: RunEvent[]): { total: number; open: number; satisfied: number; unmet: number } {
  const open = new Set<string>()
  let total = 0
  let satisfied = 0
  let unmet = 0

  for (const event of events) {
    if (event.type === 'obligation.created') {
      total += 1
      open.add(event.payload.obligation.id)
    }

    if (event.type === 'obligation.satisfied') {
      satisfied += 1
      open.delete(event.payload.obligationId)
    }

    if (event.type === 'obligation.unmet') {
      unmet += 1
      open.delete(event.payload.obligationId)
    }
  }

  return { total, open: open.size, satisfied, unmet }
}
