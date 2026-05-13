import type { ReactNode, Ref, UIEventHandler } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
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
  const menuId = useId()
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)
  const hasSessionActions = Boolean(onForkSession || onCloneSession || onExportSession)
  const showSessionActions = Boolean(conversationId && hasSessionActions)

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      if (actionsMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsActionsMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsActionsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActionsMenuOpen])

  useEffect(() => {
    if (!showSessionActions) {
      setIsActionsMenuOpen(false)
    }
  }, [showSessionActions])

  function runSessionAction(action?: () => void) {
    if (!action || isSessionActionPending) {
      return
    }

    setIsActionsMenuOpen(false)
    action()
  }

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
                <div className="session-actions-menu" ref={actionsMenuRef}>
                  <Button
                    type="button"
                    size="sm"
                    className="session-actions-trigger"
                    aria-label="Session options"
                    aria-controls={isActionsMenuOpen ? menuId : undefined}
                    aria-expanded={isActionsMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsActionsMenuOpen((current) => !current)}
                  >
                    <span className="session-actions-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </Button>
                  {isActionsMenuOpen ? (
                    <div className="session-actions-list" id={menuId} role="menu" aria-label="Session options">
                      <button type="button" role="menuitem" disabled={isSessionActionPending || !onForkSession} onClick={() => runSessionAction(onForkSession)}>Fork</button>
                      <button type="button" role="menuitem" disabled={isSessionActionPending || !onCloneSession} onClick={() => runSessionAction(onCloneSession)}>Clone</button>
                      <button type="button" role="menuitem" disabled={isSessionActionPending || !onExportSession} onClick={() => runSessionAction(onExportSession)}>Export session</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
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
