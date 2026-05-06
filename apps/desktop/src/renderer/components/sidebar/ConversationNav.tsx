import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { sessionsQueryOptions } from '../../queries'
import { formatTimestamp } from '../../utils/formatting'
import { FeedbackText } from '../ui'

export function ConversationNav() {
  const conversationsQuery = useQuery(sessionsQueryOptions)
  const sessions = conversationsQuery.data ?? []

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
        {!conversationsQuery.isLoading && !conversationsQuery.isError && sessions.length > 0 ? (
          sessions.map((session) => (
            <Link
              key={session.id}
              to="/conversations/$conversationId"
              params={{ conversationId: session.conversationId }}
              className="conversation-link"
              activeProps={{ className: 'conversation-link conversation-link-active' }}
            >
              <span>{session.parentSessionId ? `↳ ${session.title}` : session.title}</span>
              <small>{formatTimestamp(session.updatedAt)}</small>
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
