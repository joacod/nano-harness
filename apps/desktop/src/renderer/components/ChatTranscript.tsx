import { Streamdown, type Components } from 'streamdown'
import { useEffect, useState, type RefObject } from 'react'

import type { ConversationSnapshot, ReasoningDetail } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'
import { Button, FeedbackText, StatusBadge, cn } from './ui'

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

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()

  return values.filter((value) => {
    const normalizedValue = value.trim()

    if (!normalizedValue || seen.has(normalizedValue)) {
      return false
    }

    seen.add(normalizedValue)
    return true
  })
}

function normalizeReasoningText(text: string): string {
  const trimmedText = text.trim()

  if (!trimmedText) {
    return ''
  }

  const lines = trimmedText.split('\n')
  const meaningfulLines = lines.map((line) => line.trim()).filter(Boolean)
  const shortLineCount = meaningfulLines.filter((line) => line.length <= 24 && !/[.!?:;]$/.test(line)).length

  const normalizedText = meaningfulLines.length >= 6 && shortLineCount / meaningfulLines.length > 0.7
    ? meaningfulLines.join(' ').replace(/\s+([,.;:!?])/g, '$1')
    : lines
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  const paragraphs = normalizedText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const uniqueParagraphs: string[] = []

  for (const paragraph of paragraphs) {
    const compactParagraph = getComparableReasoningText(paragraph)

    if (uniqueParagraphs.some((existingParagraph) => {
      const compactExistingParagraph = getComparableReasoningText(existingParagraph)
      return isSimilarReasoningText(compactExistingParagraph, compactParagraph)
    })) {
      continue
    }

    uniqueParagraphs.push(paragraph)
  }

  return uniqueParagraphs.join('\n\n')
}

function getComparableReasoningText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getBigrams(text: string): Set<string> {
  const bigrams = new Set<string>()

  for (let index = 0; index < text.length - 1; index += 1) {
    bigrams.add(text.slice(index, index + 2))
  }

  return bigrams
}

function isSimilarReasoningText(left: string, right: string): boolean {
  if (!left || !right) {
    return false
  }

  if (left === right || left.includes(right) || right.includes(left)) {
    return true
  }

  const leftBigrams = getBigrams(left)
  const rightBigrams = getBigrams(right)

  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    return false
  }

  const intersectionSize = [...leftBigrams].filter((bigram) => rightBigrams.has(bigram)).length
  const diceCoefficient = (2 * intersectionSize) / (leftBigrams.size + rightBigrams.size)

  return diceCoefficient > 0.82
}

function normalizeReasoningChunks(values: string[]): string[] {
  const normalizedValues = dedupeStrings(values).map(normalizeReasoningText).filter(Boolean)
  const shortChunkCount = normalizedValues.filter((value) => value.length <= 24 && !/[.!?:;]$/.test(value)).length

  if (normalizedValues.length >= 6 && shortChunkCount / normalizedValues.length > 0.7) {
    return [normalizeReasoningText(normalizedValues.join('\n'))]
  }

  return normalizedValues
}

function getReasoningDisplay(reasoning?: string, details?: ReasoningDetail[]): ReasoningDisplay | null {
  const summaries = normalizeReasoningChunks(details?.flatMap((detail) => detail.type === 'reasoning.summary' ? [detail.summary] : []) ?? [])
  const textDetails = normalizeReasoningChunks(details?.flatMap((detail) => detail.type === 'reasoning.text' ? [detail.text] : []) ?? [])
  const encryptedCount = details?.filter((detail) => detail.type === 'reasoning.encrypted' || detail.type === 'reasoning.unknown').length ?? 0
  const text = normalizeReasoningText(dedupeStrings([reasoning ?? '', ...textDetails, ...summaries]).join('\n\n'))

  if (!text) {
    return null
  }

  return { text, summaries: [], encryptedCount }
}

function toOpenableUrl(href: string | undefined): string | null {
  if (!href) {
    return null
  }

  try {
    const url = new URL(href, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const openableUrl = toOpenableUrl(href)

    return (
      <a
        {...props}
        href={openableUrl ?? href}
        className="message-link"
        rel="noreferrer"
        target="_blank"
        onClick={(event) => {
          if (!openableUrl) {
            return
          }

          event.preventDefault()

          if (window.desktop?.openExternalUrl) {
            void window.desktop.openExternalUrl({ url: openableUrl }).catch(() => {
              window.open(openableUrl, '_blank', 'noopener,noreferrer')
            })
            return
          }

          window.open(openableUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        {children}
      </a>
    )
  },
}

function ThinkingPanel({ display, defaultOpen }: { display: ReasoningDisplay; defaultOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <section
      className={cn('thinking-panel', isOpen && 'thinking-panel-open')}
      onClick={() => {
        if (isOpen) {
          setIsOpen(false)
        }
      }}
    >
      <Button
        type="button"
        size="sm"
        fullWidth
        className="thinking-summary"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((current) => !current)
        }}
      >
        <span>Thinking</span>
        <span className="thinking-count">{isOpen ? 'hide details' : 'view details'}</span>
      </Button>
      {isOpen ? (
        <div className="thinking-body">
          {display.summaries.map((summary, index) => (
            <p key={`${summary}-${index}`}>{summary}</p>
          ))}
          {display.text ? <pre>{display.text}</pre> : null}
        </div>
      ) : null}
    </section>
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
      {snapshot.messages.length === 0 ? <FeedbackText>No persisted messages yet.</FeedbackText> : null}

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
            <Streamdown className="message-markdown" components={markdownComponents}>{message.content}</Streamdown>
          ) : (
            <pre className="message-pre">{message.content}</pre>
          )}
        </article>
      ))}

      {streamingState ? (
        <article className="message-bubble message-assistant message-streaming">
          <header className="message-meta message-meta-row">
            <span>assistant streaming</span>
            <StatusBadge status="streaming">{getStreamingLabel(streamingState)}</StatusBadge>
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
          {streamingState.reasoning.text || streamingState.reasoning.summaries.length > 0 ? (
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
            <Streamdown className="message-markdown" components={markdownComponents} isAnimating mode="streaming">
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
        <FeedbackText variant="error" live>
          {streamingState.errorMessage}
        </FeedbackText>
      ) : null}

      <div ref={endRef} className="transcript-end" aria-hidden="true" />
    </div>
  )
}
