import type { ApprovalRequest, ConversationSnapshot, ExportRunEvidenceResult, MemoryProposalList, RunEvent, SessionCompactionList } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'
import { RunInspectorCard } from './RunInspectorCard'
import { RunListCard } from './RunListCard'
import { SessionCompactionCard } from './SessionCompactionCard'

export function SessionTelemetry({
  events,
  onSelectRun,
  onRunEvidenceExported,
  onRunEvidenceExportError,
  pendingApproval,
  memoryProposals = null,
  compactions = null,
  isCompacting = false,
  onCompactSession,
  runs,
  selectedRun,
  selectedRunEvents,
  selectedRunId,
  streamingState,
}: {
  events: RunEvent[]
  onSelectRun: (runId: string) => void
  onRunEvidenceExported: (result: ExportRunEvidenceResult) => void
  onRunEvidenceExportError: (error: unknown) => void
  pendingApproval: ApprovalRequest | null
  memoryProposals?: MemoryProposalList | null
  compactions?: SessionCompactionList | null
  isCompacting?: boolean
  onCompactSession?: () => void
  runs: ConversationSnapshot['runs']
  selectedRun: ConversationSnapshot['runs'][number] | null
  selectedRunEvents: RunEvent[]
  selectedRunId: string | null
  streamingState: StreamingRunState | null
}) {
  return (
    <>
      <RunListCard runs={runs} events={events} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
      {onCompactSession ? <SessionCompactionCard compactions={compactions} isCompacting={isCompacting} onCompactSession={onCompactSession} /> : null}
      <RunInspectorCard
        run={selectedRun}
        events={selectedRunEvents}
        pendingApproval={pendingApproval}
        memoryProposals={memoryProposals}
        streamingState={streamingState}
        onEvidenceExported={onRunEvidenceExported}
        onEvidenceExportError={onRunEvidenceExportError}
      />
    </>
  )
}
