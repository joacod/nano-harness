import type { ReactNode, Ref, UIEventHandler } from 'react'

import { ComposerCard } from './ComposerCard'
import { Card } from './ui'

export function SessionLayout({
  conversationId,
  inspectorChildren,
  onTranscriptScroll,
  showTechnicalInfo,
  title,
  transcriptChildren,
  transcriptRef,
}: {
  conversationId: string | null
  inspectorChildren?: ReactNode
  onTranscriptScroll?: UIEventHandler<HTMLElement>
  showTechnicalInfo: boolean
  title: string
  transcriptChildren?: ReactNode
  transcriptRef?: Ref<HTMLElement>
}) {
  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack chat-panel-stack">
        <Card hero className="conversation-hero-card">
          <p className="eyebrow">Session</p>
          <h2>{title}</h2>
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
