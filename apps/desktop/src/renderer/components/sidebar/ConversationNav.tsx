import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { conversationsQueryOptions } from '../../queries'
import { formatTimestamp } from '../../utils/formatting'
import { FeedbackText } from '../ui'

export function ConversationNav() {
  const conversationsQuery = useQuery(conversationsQueryOptions)
  const conversations = conversationsQuery.data ?? []

  return (
    <div className="sidebar-section sidebar-session-section sidebar-collapsible-content">
      <div className="sidebar-header-row">
        <h2>Sessions</h2>
        <Link to="/" className="ghost-link">
          New session
        </Link>
      </div>
      <nav className="conversation-nav">
        {conversationsQuery.isLoading ? <FeedbackText>Loading conversations…</FeedbackText> : null}
        {conversationsQuery.isError ? (
          <FeedbackText variant="error" live>
            Failed to load conversations.
          </FeedbackText>
        ) : null}
        {!conversationsQuery.isLoading && !conversationsQuery.isError && conversations.length > 0 ? (
          conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to="/conversations/$conversationId"
              params={{ conversationId: conversation.id }}
              className="conversation-link"
              activeProps={{ className: 'conversation-link conversation-link-active' }}
            >
              <span>{conversation.title}</span>
              <small>{formatTimestamp(conversation.updatedAt)}</small>
            </Link>
          ))
        ) : (
          !conversationsQuery.isLoading && !conversationsQuery.isError ? (
            <FeedbackText>No sessions yet. Open a prompt channel to begin.</FeedbackText>
          ) : null
        )}
      </nav>
    </div>
  )
}
