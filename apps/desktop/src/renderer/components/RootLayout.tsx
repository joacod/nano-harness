import { Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { getProviderDefinition } from '../../../../../packages/shared/src'
import { conversationsQueryOptions, providerStatusQueryOptions, settingsQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { formatRelativeTimestamp, formatTimestamp } from '../utils/formatting'
import { describeRunEvent } from '../utils/run-events'

export function RootLayout() {
  const { context, recentEvents } = useRuntimeUi()
  const { isSidebarCollapsed, showTechnicalInfo, toggleSidebarCollapsed, toggleTechnicalInfo } = useTechnicalUi()
  const conversationsQuery = useQuery(conversationsQueryOptions)
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const conversations = conversationsQuery.data ?? []
  const settings = settingsQuery.data
  const providerStatus = providerStatusQuery.data

  return (
    <main className={`workspace-shell ${isSidebarCollapsed ? 'workspace-shell-sidebar-collapsed' : ''}`}>
      {isSidebarCollapsed ? (
        <button
          type="button"
          className="sidebar-open-button"
          aria-expanded={false}
          aria-label="Open sidebar"
          onClick={toggleSidebarCollapsed}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      ) : null}

      {!isSidebarCollapsed ? (
        <aside className="sidebar" aria-label="Workspace navigation">
          <div className="sidebar-section sidebar-brand-section">
          <button
            type="button"
            className="sidebar-collapse-button"
            aria-expanded={!isSidebarCollapsed}
            aria-label="Close sidebar"
            onClick={toggleSidebarCollapsed}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <div className="sidebar-collapsible-content">
            <p className="eyebrow">nano-harness</p>
            <h1 className="sidebar-title">Agent deck</h1>
          </div>
        </div>

        <div className="sidebar-section sidebar-collapsible-content">
          <div className="sidebar-header-row">
            <h2>Sessions</h2>
            <Link to="/" className="ghost-link">
              New session
            </Link>
          </div>
          <nav className="conversation-nav">
            {conversationsQuery.isLoading ? <p className="muted-copy">Loading conversations…</p> : null}
            {conversationsQuery.isError ? (
              <p className="error-copy" aria-live="polite">
                Failed to load conversations.
              </p>
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
                <p className="muted-copy">No sessions yet. Open a prompt channel to begin.</p>
              ) : null
            )}
          </nav>
        </div>

        <div className="sidebar-section sidebar-footer sidebar-collapsible-content">
          <div className="sidebar-footer-actions">
            <Link to="/settings" className="ghost-link" activeProps={{ className: 'ghost-link ghost-link-active' }}>
              Settings
            </Link>
            <button
              type="button"
              className={`switch-button ${showTechnicalInfo ? 'switch-button-active' : ''}`}
              role="switch"
              aria-checked={showTechnicalInfo}
              onClick={toggleTechnicalInfo}
            >
              <span>Telemetry</span>
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
            </button>
          </div>
          <p className="runtime-pill" aria-live="polite">
            {providerStatus?.isReady ? 'Provider online' : 'Provider setup required'}
          </p>
        </div>

        {showTechnicalInfo ? (
          <>
            <div className="sidebar-section sidebar-collapsible-content">
              <div className="sidebar-header-row sidebar-header-row-stacked">
                <h2>Configuration</h2>
                {providerStatus ? (
                  <span className={`runtime-pill ${providerStatus.isReady ? 'runtime-pill-ready' : 'runtime-pill-warning'}`}>
                    {providerStatus.isReady ? 'ready' : 'action needed'}
                  </span>
                ) : null}
              </div>
              {settingsQuery.isLoading ? <p className="muted-copy">Loading configuration…</p> : null}
              {settingsQuery.isError ? (
                <p className="error-copy" aria-live="polite">
                  Failed to load provider settings.
                </p>
              ) : null}
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
                    <dd>{context ? `${context.platform} / v${context.version}` : 'Loading runtime…'}</dd>
                  </div>
                </dl>
              ) : null}
              {providerStatus && providerStatus.issues.length > 0 ? (
                <div className="status-note-block">
                  {providerStatus.issues.map((issue) => (
                    <p key={issue} className="error-copy" aria-live="polite">
                      {issue}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="sidebar-section sidebar-collapsible-content">
              <h2>Recent Signals</h2>
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
                  <li>No signals yet.</li>
                )}
              </ul>
            </div>
          </>
        ) : null}
        </aside>
      ) : null}

      <section className="content-panel">
        <Outlet />
      </section>
    </main>
  )
}
