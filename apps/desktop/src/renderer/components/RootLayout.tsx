import { Link, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { providerStatusQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { ConversationNav } from './sidebar/ConversationNav'
import { RecentSignals } from './sidebar/RecentSignals'
import { RuntimeSummary } from './sidebar/RuntimeSummary'
import { Button, RuntimePill, Switch } from './ui'

export function RootLayout() {
  const { context, recentEvents } = useRuntimeUi()
  const { isSidebarCollapsed, showTechnicalInfo, toggleSidebarCollapsed, toggleTechnicalInfo } = useTechnicalUi()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const providerStatus = providerStatusQuery.data

  return (
    <main className={`workspace-shell ${isSidebarCollapsed ? 'workspace-shell-sidebar-collapsed' : ''}`}>
      <Button
        type="button"
        size="sm"
        className="sidebar-toggle-button"
        aria-expanded={!isSidebarCollapsed}
        aria-label={isSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
        onClick={toggleSidebarCollapsed}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </Button>

      {!isSidebarCollapsed ? (
        <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-section sidebar-brand-section">
          <div className="sidebar-collapsible-content">
              <p className="eyebrow">nano-harness</p>
              <h1 className="sidebar-title">Agent deck</h1>
            </div>
          </div>

        <ConversationNav />

        <div className="sidebar-section sidebar-footer sidebar-collapsible-content">
          <div className="sidebar-footer-actions">
            <Link to="/settings" className="ghost-link" activeProps={{ className: 'ghost-link ghost-link-active' }}>
              Settings
            </Link>
            <Switch
              type="button"
              checked={showTechnicalInfo}
              onClick={toggleTechnicalInfo}
            >
              Telemetry
            </Switch>
          </div>
          <RuntimePill aria-live="polite">
            {providerStatus?.isReady ? 'Provider online' : 'Provider setup required'}
          </RuntimePill>
        </div>

        {showTechnicalInfo ? (
          <>
            <RuntimeSummary context={context} />
            <RecentSignals recentEvents={recentEvents} />
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
