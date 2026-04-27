import { useEffect, useMemo, useRef, useState } from 'react'

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
  const transcriptPanelRef = useRef<HTMLElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const isTranscriptPinnedRef = useRef(true)

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
  const streamingRunId = streamingEntry?.[0] ?? null
  const streamingContentLength = streamingEntry?.[1].content.length ?? 0
  const messageCount = snapshotQuery.data?.messages.length ?? 0

  useEffect(() => {
    isTranscriptPinnedRef.current = true
    transcriptEndRef.current?.scrollIntoView({ block: 'end' })
  }, [conversationId, streamingRunId])

  useEffect(() => {
    if (isTranscriptPinnedRef.current) {
      transcriptEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messageCount, streamingContentLength])

  function handleTranscriptScroll() {
    const panel = transcriptPanelRef.current

    if (!panel) {
      return
    }

    const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight
    isTranscriptPinnedRef.current = distanceFromBottom < 96
  }

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
        <p className="eyebrow">Session</p>
        <h2>Failed to load session</h2>
        <p className="error-copy" aria-live="polite">
          {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'The session snapshot could not be loaded.'}
        </p>
      </section>
    )
  }

  if (!snapshotQuery.isLoading && !snapshotQuery.data?.conversation) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Session</p>
        <h2>Session not found</h2>
        <p className="muted-copy">This session may have been removed or has not been created yet.</p>
      </section>
    )
  }

  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack chat-panel-stack">
        <section className="panel-card panel-card-hero conversation-hero-card">
          <p className="eyebrow">Session</p>
          <h2>{snapshotQuery.data?.conversation?.title ?? 'Loading conversation…'}</h2>
          {showTechnicalInfo ? (
            <p className="muted-copy">
              Messages persist locally while the inspector mirrors live and restored event telemetry.
            </p>
          ) : null}
        </section>

        <section ref={transcriptPanelRef} className="panel-card transcript-panel" onScroll={handleTranscriptScroll}>
          {snapshotQuery.isLoading ? <p className="muted-copy">Loading messages…</p> : null}
          {!snapshotQuery.isLoading && snapshotQuery.data ? (
            <ChatTranscript snapshot={snapshotQuery.data} streamingEntry={streamingEntry ?? null} endRef={transcriptEndRef} />
          ) : null}
        </section>

        <div className="composer-sticky-shell">
          <ComposerCard conversationId={conversationId} />
        </div>
      </div>

      {showTechnicalInfo ? (
        <div className="panel-stack inspector-panel-stack">
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
