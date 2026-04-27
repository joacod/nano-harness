import { Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { getProviderDefinition } from '../../../../../packages/shared/src'
import { conversationsQueryOptions, providerStatusQueryOptions, settingsQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { formatRelativeTimestamp } from '../utils/formatting'
import { describeRunEvent } from '../utils/run-events'

export function RootLayout() {
  const { context, recentEvents } = useRuntimeUi()
  const { showTechnicalInfo, toggleTechnicalInfo } = useTechnicalUi()
  const conversationsQuery = useQuery(conversationsQueryOptions)
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const conversations = conversationsQuery.data ?? []
  const settings = settingsQuery.data
  const providerStatus = providerStatusQuery.data

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <p className="eyebrow">nano-harness</p>
          <h1 className="sidebar-title">Desktop chat harness</h1>
          <p className="sidebar-copy">
            Local runtime wiring is live. Use the conversation pane to send prompts and the settings screen to change provider config.
          </p>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-header-row">
            <h2>Conversations</h2>
            <Link to="/" className="ghost-link">
              New
            </Link>
          </div>
          <nav className="conversation-nav">
            {conversationsQuery.isLoading ? <p className="muted-copy">Loading conversations...</p> : null}
            {conversationsQuery.isError ? <p className="error-copy">Failed to load conversations.</p> : null}
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
                  <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
                </Link>
              ))
            ) : (
              !conversationsQuery.isLoading && !conversationsQuery.isError ? (
                <p className="muted-copy">No conversations yet. Start with a prompt.</p>
              ) : null
            )}
          </nav>
        </div>

        <div className="sidebar-section sidebar-footer">
          <div className="sidebar-footer-actions">
            <Link to="/settings" className="ghost-link" activeProps={{ className: 'ghost-link ghost-link-active' }}>
              Settings
            </Link>
            <button type="button" className="ghost-button" onClick={toggleTechnicalInfo}>
              {showTechnicalInfo ? 'Hide technical info' : 'Show technical info'}
            </button>
          </div>
          <p className="runtime-pill">{providerStatus?.isReady ? 'Provider ready' : 'Provider needs setup'}</p>
        </div>

        {showTechnicalInfo ? (
          <>
            <div className="sidebar-section">
              <div className="sidebar-header-row">
                <h2>Configuration</h2>
                {providerStatus ? (
                  <span className={`runtime-pill ${providerStatus.isReady ? 'runtime-pill-ready' : 'runtime-pill-warning'}`}>
                    {providerStatus.isReady ? 'ready' : 'action needed'}
                  </span>
                ) : null}
              </div>
              {settingsQuery.isLoading ? <p className="muted-copy">Loading configuration...</p> : null}
              {settingsQuery.isError ? <p className="error-copy">Failed to load provider settings.</p> : null}
              {settings ? (
                <dl className="summary-list">
                  <div>
                    <dt>Provider</dt>
                    <dd>{providerStatus?.providerLabel ?? getProviderDefinition(settings.provider.provider).label}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{settings.provider.model}</dd>
                  </div>
                  <div>
                    <dt>API key</dt>
                    <dd>{providerStatus?.apiKeyPresent ? 'Configured' : 'Missing'}</dd>
                  </div>
                  <div>
                    <dt>Workspace</dt>
                    <dd>{settings.workspace.rootPath}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{context ? `${context.platform} / v${context.version}` : 'Loading runtime...'}</dd>
                  </div>
                </dl>
              ) : null}
              {providerStatus && providerStatus.issues.length > 0 ? (
                <div className="status-note-block">
                  {providerStatus.issues.map((issue) => (
                    <p key={issue} className="error-copy">
                      {issue}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sidebar-section">
              <h2>Recent Events</h2>
              <ul className="event-list">
                {recentEvents.length > 0 ? (
                  recentEvents.map((event) => {
                    const description = describeRunEvent(event)

                    return (
                      <li key={event.id} className="event-list-item">
                        <div>
                          <strong>{description.title}</strong>
                          <small>{event.runId.slice(0, 8)}</small>
                        </div>
                        <small>{formatRelativeTimestamp(event.timestamp)}</small>
                      </li>
                    )
                  })
                ) : (
                  <li>No events yet.</li>
                )}
              </ul>
            </div>
          </>
        ) : null}
      </aside>

      <section className="content-panel">
        <Outlet />
      </section>
    </main>
  )
}
