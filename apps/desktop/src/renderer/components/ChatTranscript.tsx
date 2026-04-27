import { Streamdown } from 'streamdown'
import type { RefObject } from 'react'

import type { ConversationSnapshot, ReasoningDetail } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'

type ReasoningDisplay = {
  text: string
  summaries: string[]
  encryptedCount: number
}

function getStreamingLabel(streamingState: StreamingRunState) {
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

function getReasoningDisplay(reasoning?: string, details?: ReasoningDetail[]): ReasoningDisplay | null {
  const summaries = details?.flatMap((detail) => detail.type === 'reasoning.summary' ? [detail.summary] : []) ?? []
  const textDetails = details?.flatMap((detail) => detail.type === 'reasoning.text' ? [detail.text] : []) ?? []
  const encryptedCount = details?.filter((detail) => detail.type === 'reasoning.encrypted' || detail.type === 'reasoning.unknown').length ?? 0
  const text = `${reasoning ?? ''}${textDetails.join('')}`.trim()

  if (!text && summaries.length === 0 && encryptedCount === 0) {
    return null
  }

  return { text, summaries, encryptedCount }
}

function ThinkingPanel({ display, defaultOpen }: { display: ReasoningDisplay; defaultOpen: boolean }) {
  return (
    <details className="thinking-panel" open={defaultOpen}>
      <summary>
        <span>Thinking</span>
        <span className="thinking-count">
          {display.encryptedCount > 0 && !display.text && display.summaries.length === 0
            ? 'not displayable'
            : 'available'}
        </span>
      </summary>
      <div className="thinking-body">
        {display.summaries.map((summary, index) => (
          <p key={`${summary}-${index}`}>{summary}</p>
        ))}
        {display.text ? <pre>{display.text}</pre> : null}
        {display.encryptedCount > 0 ? (
          <p className="muted-copy">
            {display.encryptedCount} encrypted reasoning block{display.encryptedCount === 1 ? '' : 's'} preserved but not displayable.
          </p>
        ) : null}
      </div>
    </details>
  )
}

export function ChatTranscript({
  snapshot,
  streamingEntry,
  endRef,
}: {
  snapshot: ConversationSnapshot
  streamingEntry: [string, StreamingRunState] | null
  endRef: RefObject<HTMLDivElement | null>
}) {
  const streamingState = streamingEntry?.[1] ?? null

  return (
    <div className="transcript-list">
      {snapshot.messages.length === 0 ? <p className="muted-copy">No persisted messages yet.</p> : null}

      {snapshot.messages.map((message) => (
        <article key={message.id} className={`message-bubble message-${message.role}`}>
          <header className="message-meta">
            {message.role}
            {message.role === 'tool' && message.toolName ? ` · ${message.toolName}` : ''}
          </header>
          {message.role === 'assistant' && message.toolCalls?.length ? (
            <div className="message-tool-calls">
              {message.toolCalls.map((toolCall) => (
                <div key={toolCall.id} className="message-tool-call-chip">
                  <strong>{toolCall.actionId}</strong>
                  <span>{toolCall.id}</span>
                </div>
              ))}
            </div>
          ) : null}
          {message.role === 'assistant' ? (() => {
            const reasoningDisplay = getReasoningDisplay(message.reasoning, message.reasoningDetails)
            return reasoningDisplay ? <ThinkingPanel display={reasoningDisplay} defaultOpen={false} /> : null
          })() : null}
          {message.role === 'assistant' ? (
            <Streamdown>{message.content}</Streamdown>
          ) : (
            <pre className="message-pre">{message.content}</pre>
          )}
        </article>
      ))}

      {streamingState ? (
        <article className="message-bubble message-assistant message-streaming">
          <header className="message-meta message-meta-row">
            <span>assistant streaming</span>
            <span className="status-badge status-streaming">{getStreamingLabel(streamingState)}</span>
          </header>
          {streamingState.activity.length > 0 ? (
            <div className="message-activity" aria-live="polite">
              {streamingState.activity.map((activity) => (
                <div key={activity.id} className="message-activity-item">
                  <strong>{activity.title}</strong>
                  <span>{activity.detail}</span>
                </div>
              ))}
            </div>
          ) : null}
          {streamingState.reasoning.text || streamingState.reasoning.summaries.length > 0 || streamingState.reasoning.encryptedCount > 0 ? (
            <ThinkingPanel
              display={{
                text: streamingState.reasoning.text,
                summaries: streamingState.reasoning.summaries,
                encryptedCount: streamingState.reasoning.encryptedCount,
              }}
              defaultOpen
            />
          ) : null}
          {streamingState.content ? (
            <Streamdown isAnimating mode="streaming">
              {streamingState.content}
            </Streamdown>
          ) : (
            <p className="streaming-placeholder" aria-live="polite">
              {getStreamingLabel(streamingState)}
            </p>
          )}
        </article>
      ) : null}

      {streamingState?.errorMessage ? (
        <p className="error-copy" aria-live="polite">
          {streamingState.errorMessage}
        </p>
      ) : null}

      <div ref={endRef} className="transcript-end" aria-hidden="true" />
    </div>
  )
}
