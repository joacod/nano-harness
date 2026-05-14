import type { RefObject } from 'react'

import type { ApprovalRequest, ConversationSnapshot } from '../../../../../packages/shared/src'
import type { StreamingRunState } from '../utils/run-events'
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

      {snapshot.messages.map((message) => (
        <MessageBubble key={message.id} message={message} showAdvancedChatActivity={showAdvancedChatActivity} />
      ))}

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
