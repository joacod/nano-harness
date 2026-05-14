import type { RefObject } from 'react'

import type { ApprovalRequest, ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'
import { describeRunEvent, isTransientRunEvent } from '../utils/run-events'
import { ApprovalPrompt } from './chat/ApprovalPrompt'
import { MessageBubble } from './chat/MessageBubble'
import { StreamingMessageBubble } from './chat/StreamingMessageBubble'
import { FeedbackText } from './ui'

export function ChatTranscript({
  snapshot,
  streamingEntry,
  endRef,
  pendingApproval,
  showAdvancedChatActivity = false,
}: {
  snapshot: ConversationSnapshot
  streamingEntry: [string, StreamingRunState] | null
  endRef: RefObject<HTMLDivElement | null>
  pendingApproval: ApprovalRequest | null
  showAdvancedChatActivity?: boolean
}) {
  const streamingState = streamingEntry?.[1] ?? null

  return (
    <div className="transcript-list">
      {snapshot.messages.length === 0 ? <FeedbackText>No persisted messages yet.</FeedbackText> : null}

      {renderTranscriptMessages({
        activeRunId: streamingEntry?.[0] ?? null,
        showAdvancedChatActivity,
        snapshot,
      })}

      {streamingState ? (
        <StreamingMessageBubble streamingState={streamingState} showAdvancedChatActivity={showAdvancedChatActivity} />
      ) : null}

      {pendingApproval ? <ApprovalPrompt pendingApproval={pendingApproval} /> : null}

      {streamingState?.errorMessage ? (
        <FeedbackText variant="error" live>
          {streamingState.errorMessage}
        </FeedbackText>
      ) : null}

      <div ref={endRef} className="transcript-end" aria-hidden="true" />
    </div>
  )
}

function renderTranscriptMessages({
  activeRunId,
  showAdvancedChatActivity,
  snapshot,
}: {
  activeRunId: string | null
  showAdvancedChatActivity: boolean
  snapshot: ConversationSnapshot
}) {
  const transcriptItems: TranscriptSortItem[] = snapshot.messages.map((message, index) => ({
    id: message.id,
    index,
    kind: 'message',
    message,
    priority: getMessageOrderPriority(message),
    timestamp: message.createdAt,
  }))

  if (showAdvancedChatActivity) {
    const runIds = new Set(snapshot.messages.flatMap((message) => message.runId ? [message.runId] : []))

    for (const runId of runIds) {
      if (runId === activeRunId) {
        continue
      }

      for (const event of getPersistedActivityEvents(snapshot, runId)) {
        transcriptItems.push({
          event,
          id: event.id,
          index: transcriptItems.length,
          kind: 'activity',
          priority: 1,
          timestamp: event.timestamp,
        })
      }
    }
  }

  const sortedItems = transcriptItems.sort((left, right) => {
    const timestampOrder = left.timestamp.localeCompare(right.timestamp)

    if (timestampOrder !== 0) {
      return timestampOrder
    }

    const priorityOrder = left.priority - right.priority

    if (priorityOrder !== 0) {
      return priorityOrder
    }

    return left.index - right.index
  })
  const renderedItems = []
  let activityGroup: RunEvent[] = []

  for (const item of sortedItems) {
    if (item.kind === 'activity') {
      activityGroup.push(item.event)
      continue
    }

    if (activityGroup.length > 0) {
      renderedItems.push(<PersistedRunActivityBubble key={getActivityGroupKey(activityGroup)} events={activityGroup} />)
      activityGroup = []
    }

    renderedItems.push(
      <MessageBubble key={item.message.id} message={item.message} showAdvancedChatActivity={showAdvancedChatActivity} />,
    )
  }

  if (activityGroup.length > 0) {
    renderedItems.push(<PersistedRunActivityBubble key={getActivityGroupKey(activityGroup)} events={activityGroup} />)
  }

  return renderedItems
}

type TranscriptSortItem = {
  id: string
  index: number
  priority: number
  timestamp: string
} & (
  | {
    kind: 'activity'
    event: RunEvent
  }
  | {
    kind: 'message'
    message: ConversationSnapshot['messages'][number]
  }
)

function PersistedRunActivityBubble({ events }: { events: RunEvent[] }) {
  return (
    <article className="message-bubble message-assistant message-activity-bubble">
      <header className="message-meta">assistant activity</header>
      <div className="message-activity message-activity-persisted" aria-label="Persisted advanced chat activity">
        {events.map((event) => {
          const activity = describeRunEvent(event)

          return (
            <div key={event.id} className="message-activity-item">
              <strong>{activity.title}</strong>
              <span>{activity.detail}</span>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function getPersistedActivityEvents(snapshot: ConversationSnapshot, runId: string) {
  return snapshot.events
    .filter((event) => event.runId === runId && shouldShowPersistedActivityEvent(event))
}

function getActivityGroupKey(events: RunEvent[]) {
  return `activity-${events.map((event) => event.id).join('-')}`
}

function getMessageOrderPriority(message: ConversationSnapshot['messages'][number]) {
  if (message.role === 'user') {
    return 0
  }

  return 2
}

function shouldShowPersistedActivityEvent(event: RunEvent) {
  if (isTransientRunEvent(event) || event.type === 'message.created') {
    return false
  }

  return event.type !== 'run.created'
}
