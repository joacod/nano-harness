import { useEffect, useRef } from 'react'

import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { providerStatusQueryOptions } from '../queries'
import { useRuntimeUi, useTechnicalUi } from '../runtime-ui'
import { ConversationNav } from './sidebar/ConversationNav'
import { RecentSignals } from './sidebar/RecentSignals'
import { RuntimeSummary } from './sidebar/RuntimeSummary'
import { Button, RuntimePill, Switch } from './ui'

export function RootLayout() {
  const navigate = useNavigate()
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  const lastSessionPathRef = useRef('/')
  const { context, recentEvents } = useRuntimeUi()
  const { isSidebarCollapsed, showTechnicalInfo, toggleSidebarCollapsed, toggleTechnicalInfo } = useTechnicalUi()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const providerStatus = providerStatusQuery.data
  const isSettingsOpen = currentPath === '/settings'

  useEffect(() => {
    if (currentPath === '/' || currentPath.startsWith('/conversations/')) {
      lastSessionPathRef.current = currentPath
    }
  }, [currentPath])

  function handleSettingsClick() {
    if (!isSettingsOpen) {
      void navigate({ to: '/settings' })
      return
    }

    const sessionPath = lastSessionPathRef.current

    if (sessionPath.startsWith('/conversations/')) {
      void navigate({
        to: '/conversations/$conversationId',
        params: { conversationId: decodeURIComponent(sessionPath.slice('/conversations/'.length)) },
      })
      return
    }

    void navigate({ to: '/' })
  }

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

          {showTechnicalInfo ? (
            <div className="sidebar-telemetry-details">
              <RuntimeSummary context={context} />
              <RecentSignals recentEvents={recentEvents} />
            </div>
          ) : null}

          <div className="sidebar-section sidebar-footer sidebar-collapsible-content">
            <button
              type="button"
              className={`ghost-link${isSettingsOpen ? ' ghost-link-active' : ''}`}
              aria-pressed={isSettingsOpen}
              onClick={handleSettingsClick}
            >
              Settings
            </button>
            <div className="sidebar-footer-status-row">
              <Switch
                type="button"
                className="sidebar-compact-switch"
                checked={showTechnicalInfo}
                onClick={toggleTechnicalInfo}
              >
                Telemetry
              </Switch>
              <RuntimePill className="sidebar-provider-pill" tone={providerStatus?.isReady ? 'ready' : 'warning'} aria-live="polite">
                Provider
              </RuntimePill>
            </div>
          </div>
        </aside>
      ) : null}

      <section className="content-panel">
        <Outlet />
      </section>
    </main>
  )
}
