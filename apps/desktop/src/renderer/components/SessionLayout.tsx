import type { ReactNode, Ref, UIEventHandler } from 'react'
import { useQuery } from '@tanstack/react-query'

import { providerStatusQueryOptions } from '../queries'
import { rendererFeatureFlags } from '../features'
import { ComposerCard } from './ComposerCard'
import { SessionActionsMenu } from './SessionActionsMenu'
import { Card } from './ui'

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
  isSessionActionPending?: boolean
}) {
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const providerStatus = providerStatusQuery.data
  const hasSessionActions = Boolean(onForkSession || onCloneSession || onExportSession)
  const showSessionActions = Boolean(rendererFeatureFlags.sessionActions && conversationId && hasSessionActions)

  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack chat-panel-stack">
        <Card hero className="conversation-hero-card">
          <div className="conversation-hero-content">
            <div className="conversation-hero-title">
              <p className="eyebrow">Session</p>
              <h2>{title}</h2>
            </div>
            <div className="session-hero-meta">
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
              {showSessionActions ? (
                <SessionActionsMenu
                  isPending={isSessionActionPending}
                  onCloneSession={onCloneSession}
                  onExportSession={onExportSession}
                  onForkSession={onForkSession}
                />
              ) : null}
            </div>
          </div>
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
