import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { ChatTranscript } from '../components/ChatTranscript'
import { ComposerCard } from '../components/ComposerCard'
import { RunInspectorCard } from '../components/RunInspectorCard'
import { RunListCard } from '../components/RunListCard'
import { conversationQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { getPendingApproval, mergeRunEvents } from '../utils/run-events'

export function ConversationRoute() {
  const { conversationId } = useParams({ from: '/conversations/$conversationId' })
  const { showTechnicalInfo } = useTechnicalUi()
  const snapshotQuery = useQuery(conversationQueryOptions(conversationId))
  const { liveRunEvents, streamingRuns } = useRuntimeUi()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    const runs = snapshotQuery.data?.runs ?? []

    if (runs.length === 0) {
      setSelectedRunId(null)
      return
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs.at(-1)?.id ?? null)
    }
  }, [selectedRunId, snapshotQuery.data?.runs])

  const streamingEntry = useMemo(() => {
    return Object.entries(streamingRuns).find(([, run]) => run.conversationId === conversationId)
  }, [conversationId, streamingRuns])

  const selectedRun = useMemo(() => {
    return snapshotQuery.data?.runs.find((run) => run.id === selectedRunId) ?? null
  }, [selectedRunId, snapshotQuery.data?.runs])

  const selectedRunEvents = useMemo(() => {
    if (!selectedRunId) {
      return []
    }

    return mergeRunEvents(
      snapshotQuery.data?.events.filter((event) => event.runId === selectedRunId) ?? [],
      liveRunEvents[selectedRunId] ?? [],
    )
  }, [liveRunEvents, selectedRunId, snapshotQuery.data?.events])

  const pendingApproval = useMemo(() => {
    return getPendingApproval(snapshotQuery.data, selectedRunId)
  }, [selectedRunId, snapshotQuery.data])

  if (snapshotQuery.isError) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Conversation</p>
        <h2>Failed to load conversation</h2>
        <p className="error-copy" aria-live="polite">
          {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'The conversation snapshot could not be loaded.'}
        </p>
      </section>
    )
  }

  if (!snapshotQuery.isLoading && !snapshotQuery.data?.conversation) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Conversation</p>
        <h2>Conversation not found</h2>
        <p className="muted-copy">This conversation may have been removed or has not been created yet.</p>
      </section>
    )
  }

  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack">
        <section className="panel-card panel-card-hero">
          <p className="eyebrow">Conversation</p>
          <h2>{snapshotQuery.data?.conversation?.title ?? 'Loading conversation…'}</h2>
          {showTechnicalInfo ? (
            <p className="muted-copy">
              Messages are persisted in SQLite and the run inspector shows the same event model both live and after relaunch.
            </p>
          ) : null}
        </section>

        <section className="panel-card transcript-panel">
          {snapshotQuery.isLoading ? <p className="muted-copy">Loading messages…</p> : null}
          {!snapshotQuery.isLoading && snapshotQuery.data ? (
            <ChatTranscript snapshot={snapshotQuery.data} streamingEntry={streamingEntry ?? null} />
          ) : null}
        </section>

        <ComposerCard conversationId={conversationId} />
      </div>

      {showTechnicalInfo ? (
        <div className="panel-stack">
          <RunListCard
            runs={snapshotQuery.data?.runs ?? []}
            events={snapshotQuery.data?.events ?? []}
            selectedRunId={selectedRunId}
            onSelectRun={(runId) => setSelectedRunId(runId)}
          />
          <RunInspectorCard
            run={selectedRun}
            events={selectedRunEvents}
            pendingApproval={pendingApproval}
            streamingState={selectedRun ? streamingRuns[selectedRun.id] ?? null : null}
          />
        </div>
      ) : null}
    </div>
  )
}
