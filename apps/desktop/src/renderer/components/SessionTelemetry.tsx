import type { ApprovalRequest, ConversationSnapshot, ExportRunEvidenceResult, MemoryProposalList, MemoryRecordList, RunEvent } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'
import { RunInspectorCard } from './RunInspectorCard'
import { RunListCard } from './RunListCard'

export function SessionTelemetry({
  events,
  onSelectRun,
  onRunEvidenceExported,
  onRunEvidenceExportError,
  pendingApproval,
  memoryProposals = null,
  memoryRecords = null,
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
  memoryRecords?: MemoryRecordList | null
  runs: ConversationSnapshot['runs']
  selectedRun: ConversationSnapshot['runs'][number] | null
  selectedRunEvents: RunEvent[]
  selectedRunId: string | null
  streamingState: StreamingRunState | null
}) {
  return (
    <>
      <RunListCard runs={runs} events={events} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
      <RunInspectorCard
        run={selectedRun}
        events={selectedRunEvents}
        pendingApproval={pendingApproval}
        memoryProposals={memoryProposals}
        memoryRecords={memoryRecords}
        streamingState={streamingState}
        onEvidenceExported={onRunEvidenceExported}
        onEvidenceExportError={onRunEvidenceExportError}
      />
    </>
  )
}
