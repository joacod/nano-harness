import { Streamdown } from 'streamdown'

import type { ConversationSnapshot } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'

export function ChatTranscript({
  snapshot,
  streamingEntry,
}: {
  snapshot: ConversationSnapshot
  streamingEntry: [string, StreamingRunState] | null
}) {
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
          {message.role === 'assistant' ? (
            <Streamdown>{message.content}</Streamdown>
          ) : (
            <pre className="message-pre">{message.content}</pre>
          )}
        </article>
      ))}

      {streamingEntry && streamingEntry[1].content ? (
        <article className="message-bubble message-assistant message-streaming">
          <header className="message-meta">assistant streaming</header>
          <Streamdown isAnimating mode="streaming">
            {streamingEntry[1].content}
          </Streamdown>
        </article>
      ) : null}

      {streamingEntry?.[1].errorMessage ? (
        <p className="error-copy" aria-live="polite">
          {streamingEntry[1].errorMessage}
        </p>
      ) : null}
    </div>
  )
}
