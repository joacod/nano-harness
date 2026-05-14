import { useState } from 'react'

import type { ConversationSnapshot } from '../../../../../../packages/shared/src'

import { getReasoningDisplay } from './reasoning'
import { MarkdownMessage } from './MarkdownMessage'
import { ThinkingPanel } from './ThinkingPanel'

type Message = ConversationSnapshot['messages'][number]

const collapsedToolOutputLength = 600

export function MessageBubble({
  message,
  showAdvancedChatActivity = false,
}: {
  message: Message
  showAdvancedChatActivity?: boolean
}) {
  const reasoningDisplay = message.role === 'assistant'
    ? getReasoningDisplay(message.reasoning, message.reasoningDetails)
    : null
  const hasAssistantContent = message.role === 'assistant' && message.content.trim().length > 0

  if (!showAdvancedChatActivity && message.role === 'tool') {
    return null
  }

  if (!showAdvancedChatActivity && message.role === 'assistant' && !hasAssistantContent && !reasoningDisplay && message.toolCalls?.length) {
    return null
  }

  return (
    <article className={`message-bubble message-${message.role}`}>
      <header className="message-meta">
        {message.role}
        {message.role === 'tool' && message.toolName ? ` · ${message.toolName}` : ''}
      </header>
      {showAdvancedChatActivity && message.role === 'assistant' && message.toolCalls?.length ? (
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
        hasAssistantContent ? <MarkdownMessage content={message.content} /> : null
      ) : message.role === 'tool' ? (
        <ToolResultMessage message={message} />
      ) : (
        <pre className="message-pre">{message.content}</pre>
      )}
    </article>
  )
}

function ToolResultMessage({ message }: { message: Extract<Message, { role: 'tool' }> }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const output = formatToolOutput(message.content)
  const isLong = output.raw.length > collapsedToolOutputLength
  const shouldShowOutput = !isLong || isExpanded

  return (
    <div className="tool-output-details">
      <div className="tool-output-summary">
        <span>{summarizeToolOutput(message.toolName, message.content)}</span>
        {isLong ? (
          <button className="tool-output-toggle" type="button" onClick={() => setIsExpanded((current) => !current)}>
            {isExpanded ? 'Show less' : 'Show full output'}
          </button>
        ) : null}
      </div>
      {shouldShowOutput ? <pre className="message-pre tool-output-pre">{output.raw}</pre> : null}
    </div>
  )
}

function formatToolOutput(content: string) {
  try {
    return { raw: JSON.stringify(JSON.parse(content), null, 2) }
  } catch {
    return { raw: content }
  }
}

function summarizeToolOutput(toolName: string | undefined, content: string) {
  const fallbackName = toolName ? formatToolName(toolName) : 'Tool result'

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const path = typeof parsed['path'] === 'string' && parsed['path'].trim() ? parsed['path'] : null

    if (typeof parsed['content'] === 'string') {
      const lineCount = parsed['content'].split('\n').length
      return `${fallbackName}${path ? ` · ${path}` : ''} · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
    }

    if (Array.isArray(parsed['entries'])) {
      const count = parsed['entries'].length
      return `${fallbackName}${path ? ` · ${path}` : ''} · ${count} ${count === 1 ? 'entry' : 'entries'}`
    }

    if (path) {
      return `${fallbackName} · ${path}`
    }
  } catch {
    // Plain-text tool outputs are still shown with the tool name and collapsible body.
  }

  return fallbackName
}

function formatToolName(toolName: string) {
  return toolName
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}
