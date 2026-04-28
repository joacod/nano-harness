import type { ConversationSnapshot } from '../../../../../../packages/shared/src'

import { getReasoningDisplay } from './reasoning'
import { MarkdownMessage } from './MarkdownMessage'
import { ThinkingPanel } from './ThinkingPanel'

type Message = ConversationSnapshot['messages'][number]

export function MessageBubble({ message }: { message: Message }) {
  const reasoningDisplay = message.role === 'assistant'
    ? getReasoningDisplay(message.reasoning, message.reasoningDetails)
    : null

  return (
    <article className={`message-bubble message-${message.role}`}>
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
      {reasoningDisplay ? <ThinkingPanel display={reasoningDisplay} defaultOpen={false} /> : null}
      {message.role === 'assistant' ? (
        <MarkdownMessage content={message.content} />
      ) : (
        <pre className="message-pre">{message.content}</pre>
      )}
    </article>
  )
}
