import { useEffect, useRef } from 'react'

import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { rendererFeatureFlags } from '../features'
import { providerStatusQueryOptions, specChangesQueryOptions } from '../queries'
import { useTechnicalUi } from '../runtime-ui'
import { ConversationNav } from './sidebar/ConversationNav'
import { Button, RuntimePill, Switch } from './ui'

export function RootLayout() {
  const navigate = useNavigate()
  const currentPath = useRouterState({ select: (state) => state.location.pathname })
  const lastSessionPathRef = useRef('/')
  const { advancedSettings, isAdvancedUiActive, isSidebarCollapsed, toggleSidebarCollapsed, toggleTechnicalInfo } = useTechnicalUi()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const specChangesQuery = useQuery({
    ...specChangesQueryOptions,
    enabled: rendererFeatureFlags.specs,
  })
  const providerStatus = providerStatusQuery.data
  const activeSpecCount = specChangesQuery.data?.changes?.filter((change) => change.summary.status !== 'archived' && change.summary.status !== 'verified').length ?? 0
  const advancedFeaturesEnabled = advancedSettings?.enabled ?? true
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
          <ConversationNav />

          {rendererFeatureFlags.specs ? (
            <div className="sidebar-section sidebar-collapsible-content">
              <Link
                to="/specs"
                className="ghost-link sidebar-wide-link"
                activeProps={{ className: 'ghost-link ghost-link-active sidebar-wide-link' }}
              >
                <span>Specs</span>
                {activeSpecCount > 0 ? <span className="sidebar-count-badge" aria-label={`${activeSpecCount} active spec changes`}>{activeSpecCount}</span> : null}
              </Link>
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
              {advancedFeaturesEnabled ? (
                <Switch
                  type="button"
                  className="sidebar-compact-switch"
                  checked={isAdvancedUiActive}
                  onClick={toggleTechnicalInfo}
                >
                  Advanced
                </Switch>
              ) : null}
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
