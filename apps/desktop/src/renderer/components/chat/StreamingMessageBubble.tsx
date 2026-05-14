import type { StreamingRunState } from '../../utils/run-events'
import { StatusBadge } from '../ui'
import { MarkdownMessage } from './MarkdownMessage'
import { dedupeStrings, normalizeReasoningChunks, normalizeReasoningText } from './reasoning'
import { ThinkingPanel } from './ThinkingPanel'

export function getStreamingLabel(streamingState: StreamingRunState) {
  if (streamingState.content) {
    return 'Receiving response…'
  }

  switch (streamingState.phase) {
    case 'queued':
      return 'Preparing run…'
    case 'started':
      return 'Working…'
    case 'contacting_provider':
      return 'Contacting provider…'
    case 'using_tools':
      return 'Using tools…'
    case 'waiting_approval':
      return 'Waiting for approval…'
    case 'streaming':
      return 'Receiving response…'
  }
}

export function StreamingMessageBubble({
  streamingState,
  showAdvancedChatActivity,
}: {
  streamingState: StreamingRunState
  showAdvancedChatActivity: boolean
}) {
  const hasThinking = Boolean(streamingState.reasoning.text || streamingState.reasoning.summaries.length > 0)

  if (!showAdvancedChatActivity && !streamingState.content && !hasThinking) {
    return (
      <div className="streaming-compact" aria-live="polite">
        <span className="streaming-waiting-orb" aria-hidden="true" />
        <span>{getStreamingLabel(streamingState)}</span>
      </div>
    )
  }

  return (
    <article className="message-bubble message-assistant message-streaming">
      <header className="message-meta message-meta-row">
        <span>assistant streaming</span>
        <StatusBadge status="streaming">{getStreamingLabel(streamingState)}</StatusBadge>
      </header>
      {showAdvancedChatActivity && streamingState.activity.length > 0 ? (
        <div className="message-activity" aria-live="polite">
          {streamingState.activity.map((activity) => (
            <div key={activity.id} className="message-activity-item">
              <strong>{activity.title}</strong>
              <span>{activity.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
      {hasThinking ? (
        <ThinkingPanel
          display={{
            text: normalizeReasoningText(dedupeStrings([
              streamingState.reasoning.text,
              ...normalizeReasoningChunks(streamingState.reasoning.summaries),
            ]).join('\n\n')),
            summaries: [],
            encryptedCount: streamingState.reasoning.encryptedCount,
          }}
          defaultOpen={!streamingState.content}
        />
      ) : null}
      {streamingState.content ? (
        <MarkdownMessage content={streamingState.content} streaming />
      ) : !hasThinking ? (
        <div className="streaming-waiting" aria-live="polite">
          <span className="streaming-waiting-orb" aria-hidden="true" />
          <span>{getStreamingLabel(streamingState)}</span>
        </div>
      ) : (
        <p className="streaming-placeholder" aria-live="polite">
          {getStreamingLabel(streamingState)}
        </p>
      )}
    </article>
  )
}
