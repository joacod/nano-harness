import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'

import { ChatTranscript } from '../components/ChatTranscript'
import { SessionLayout } from '../components/SessionLayout'
import { SessionTelemetry } from '../components/SessionTelemetry'
import { Card, FeedbackText, Toast, type ToastMessage } from '../components/ui'
import { conversationQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { getLatestConversationPendingApproval, getPendingApproval, mergeRunEvents } from '../utils/run-events'

export function ConversationRoute() {
  const { conversationId } = useParams({ from: '/conversations/$conversationId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showTechnicalInfo } = useTechnicalUi()
  const snapshotQuery = useQuery(conversationQueryOptions(conversationId))
  const { liveRunEvents, streamingRuns } = useRuntimeUi()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
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

  useEffect(() => {
    setToast(null)
  }, [conversationId])

  const streamingEntry = useMemo(() => {
    return Object.entries(streamingRuns).find(([, run]) => run.conversationId === conversationId)
  }, [conversationId, streamingRuns])
  const streamingRunId = streamingEntry?.[0] ?? null
  const streamingContentLength = streamingEntry?.[1].content.length ?? 0
  const messageCount = snapshotQuery.data?.messages.length ?? 0

  function scrollTranscriptToBottom() {
    const panel = transcriptPanelRef.current

    if (!panel) {
      return
    }

    panel.scrollTop = panel.scrollHeight

    requestAnimationFrame(() => {
      panel.scrollTop = panel.scrollHeight
      requestAnimationFrame(() => {
        panel.scrollTop = panel.scrollHeight
      })
    })
  }

  useLayoutEffect(() => {
    isTranscriptPinnedRef.current = true
    scrollTranscriptToBottom()
  }, [conversationId, streamingRunId])

  useLayoutEffect(() => {
    if (isTranscriptPinnedRef.current) {
      scrollTranscriptToBottom()
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
    return getPendingApproval(snapshotQuery.data, selectedRunId, selectedRunEvents)
  }, [selectedRunEvents, selectedRunId, snapshotQuery.data])
  const chatPendingApproval = useMemo(() => {
    return getLatestConversationPendingApproval(snapshotQuery.data, liveRunEvents)
  }, [liveRunEvents, snapshotQuery.data])
  const forkSessionMutation = useMutation({
    mutationFn: async () => window.desktop.forkSession({ sessionId: conversationId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      await navigate({ to: '/conversations/$conversationId', params: { conversationId: result.conversationId } })
    },
    onError: (error) => showSessionActionToast(error, setToast),
  })
  const cloneSessionMutation = useMutation({
    mutationFn: async () => window.desktop.cloneSession({ sessionId: conversationId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      await navigate({ to: '/conversations/$conversationId', params: { conversationId: result.conversationId } })
    },
    onError: (error) => showSessionActionToast(error, setToast),
  })
  const exportSessionMutation = useMutation({
    mutationFn: async () => window.desktop.exportSession({ sessionId: conversationId }),
    onSuccess: (result) => {
      setToast({
        id: `session-export-${Date.now()}`,
        title: 'Session exported',
        message: `Saved ${getFileName(result.exportedFilePath)} locally.`,
        action: {
          label: 'Open folder',
          onClick: () => {
            void window.desktop.showItemInFolder({ filePath: result.exportedFilePath })
          },
        },
        variant: 'success',
      })
    },
    onError: (error) => showSessionActionToast(error, setToast),
  })

  if (snapshotQuery.isError) {
    return (
      <Card hero>
        <p className="eyebrow">Session</p>
        <h2>Failed to load session</h2>
        <FeedbackText variant="error" live>
          {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'The session snapshot could not be loaded.'}
        </FeedbackText>
      </Card>
    )
  }

  if (!snapshotQuery.isLoading && !snapshotQuery.data?.conversation) {
    return (
      <Card hero>
        <p className="eyebrow">Session</p>
        <h2>Session not found</h2>
        <FeedbackText>This session may have been removed or has not been created yet.</FeedbackText>
      </Card>
    )
  }

  return (
    <>
      <SessionLayout
        conversationId={conversationId}
        showTechnicalInfo={showTechnicalInfo}
        title={snapshotQuery.data?.conversation?.title ?? 'Loading conversation…'}
        transcriptRef={transcriptPanelRef}
        onTranscriptScroll={handleTranscriptScroll}
        isSessionActionPending={forkSessionMutation.isPending || cloneSessionMutation.isPending || exportSessionMutation.isPending}
        onForkSession={() => forkSessionMutation.mutate()}
        onCloneSession={() => cloneSessionMutation.mutate()}
        onExportSession={() => exportSessionMutation.mutate()}
        transcriptChildren={(
          <>
            {snapshotQuery.isLoading ? <FeedbackText>Loading messages…</FeedbackText> : null}
            {!snapshotQuery.isLoading && snapshotQuery.data ? (
              <ChatTranscript
                snapshot={snapshotQuery.data}
                streamingEntry={streamingEntry ?? null}
                endRef={transcriptEndRef}
                pendingApproval={chatPendingApproval}
              />
            ) : null}
          </>
        )}
        inspectorChildren={(
          <SessionTelemetry
            runs={snapshotQuery.data?.runs ?? []}
            events={snapshotQuery.data?.events ?? []}
            selectedRunId={selectedRunId}
            onSelectRun={(runId) => setSelectedRunId(runId)}
            selectedRun={selectedRun}
            selectedRunEvents={selectedRunEvents}
            pendingApproval={pendingApproval}
            streamingState={selectedRun ? streamingRuns[selectedRun.id] ?? null : null}
            onRunEvidenceExported={(result) => {
              setToast({
                id: `run-evidence-export-${Date.now()}`,
                title: 'Evidence exported',
                message: `Saved ${getFileName(result.exportedFilePath)} locally.`,
                action: {
                  label: 'Open folder',
                  onClick: () => {
                    void window.desktop.showItemInFolder({ filePath: result.exportedFilePath })
                  },
                },
                variant: 'success',
              })
            }}
            onRunEvidenceExportError={(error) => {
              setToast({
                id: `run-evidence-export-error-${Date.now()}`,
                title: 'Evidence export failed',
                message: error instanceof Error ? error.message : 'The run evidence could not be exported.',
                variant: 'error',
              })
            }}
          />
        )}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}

function showSessionActionToast(error: unknown, setToast: (toast: ToastMessage) => void) {
  setToast({
    id: `session-action-error-${Date.now()}`,
    title: 'Session action failed',
    message: error instanceof Error ? error.message : 'The session action could not be completed.',
    variant: 'error',
  })
}

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}
