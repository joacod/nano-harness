import type { ReactNode, Ref, UIEventHandler } from 'react'
import { useQuery } from '@tanstack/react-query'

import { providerStatusQueryOptions } from '../queries'
import { ComposerCard } from './ComposerCard'
import { Button, Card, FeedbackText } from './ui'

export function SessionLayout({
  conversationId,
  inspectorChildren,
  onTranscriptScroll,
  showTechnicalInfo,
  title,
  transcriptChildren,
  transcriptRef,
  onCloneSession,
  onExportSession,
  onForkSession,
  sessionActionError,
  sessionExportPath,
  isSessionActionPending,
}: {
  conversationId: string | null
  inspectorChildren?: ReactNode
  onTranscriptScroll?: UIEventHandler<HTMLElement>
  showTechnicalInfo: boolean
  title: string
  transcriptChildren?: ReactNode
  transcriptRef?: Ref<HTMLElement>
  onCloneSession?: () => void
  onExportSession?: () => void
  onForkSession?: () => void
  sessionActionError?: string | null
  sessionExportPath?: string | null
  isSessionActionPending?: boolean
}) {
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const providerStatus = providerStatusQuery.data

  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack chat-panel-stack">
        <Card hero className="conversation-hero-card">
          <div className="conversation-hero-content">
            <div className="conversation-hero-title">
              <p className="eyebrow">Session</p>
              <h2>{title}</h2>
            </div>
            {providerStatus ? (
              <div
                className={`session-provider-chip ${providerStatus.isReady ? 'session-provider-chip-ready' : 'session-provider-chip-warning'}`}
                aria-live="polite"
                title={`${providerStatus.providerLabel} · ${providerStatus.model}`}
              >
                <span>{providerStatus.providerLabel}</span>
                <strong>{providerStatus.model}</strong>
              </div>
            ) : null}
          </div>
          <div className="run-controls">
            <Button type="button" disabled={isSessionActionPending || !onForkSession} onClick={onForkSession}>Fork</Button>
            <Button type="button" disabled={isSessionActionPending || !onCloneSession} onClick={onCloneSession}>Clone</Button>
            <Button type="button" disabled={isSessionActionPending || !onExportSession} onClick={onExportSession}>Export session</Button>
          </div>
          {sessionExportPath ? <FeedbackText live>Exported session to {sessionExportPath}</FeedbackText> : null}
          {sessionActionError ? <FeedbackText variant="error" live>{sessionActionError}</FeedbackText> : null}
        </Card>

        <Card ref={transcriptRef} className="transcript-panel" onScroll={onTranscriptScroll}>
          {transcriptChildren}
        </Card>

        <div className="composer-sticky-shell">
          <ComposerCard conversationId={conversationId} />
        </div>
      </div>

      {showTechnicalInfo && inspectorChildren ? <div className="panel-stack inspector-panel-stack">{inspectorChildren}</div> : null}
    </div>
  )
}
