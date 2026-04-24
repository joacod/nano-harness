import { createContext, startTransition, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useForm } from '@tanstack/react-form'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { Streamdown } from 'streamdown'

import type {
  AppSettings,
  ApprovalRequest,
  ConversationSnapshot,
  DesktopContext,
  ProviderStatus,
  RunEvent,
} from '../../../../packages/shared/src'
import { getProviderDefinition, providerOptions } from '../../../../packages/shared/src'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute,
})

const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations/$conversationId',
  component: ConversationRoute,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute,
})

const routeTree = rootRoute.addChildren([homeRoute, conversationRoute, settingsRoute])

const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

type StreamingRunState = {
  conversationId: string
  content: string
  isStreaming: boolean
  errorMessage?: string
}

type RuntimeUiState = {
  context: DesktopContext | null
  recentEvents: RunEvent[]
  liveRunEvents: Record<string, RunEvent[]>
  streamingRuns: Record<string, StreamingRunState>
}

const RuntimeUiContext = createContext<RuntimeUiState | null>(null)
const TechnicalUiContext = createContext<{ showTechnicalInfo: boolean; toggleTechnicalInfo: () => void } | null>(null)

function useRuntimeUi(): RuntimeUiState {
  const value = useContext(RuntimeUiContext)

  if (!value) {
    throw new Error('Runtime UI context is unavailable')
  }

  return value
}

function useTechnicalUi() {
  const value = useContext(TechnicalUiContext)

  if (!value) {
    throw new Error('Technical UI context is unavailable')
  }

  return value
}

const contextQueryOptions = queryOptions({
  queryKey: ['desktop-context'],
  queryFn: () => window.desktop.getContext(),
})

const settingsQueryOptions = queryOptions({
  queryKey: ['settings'],
  queryFn: () => window.desktop.getSettings(),
})

const providerStatusQueryOptions = queryOptions({
  queryKey: ['provider-status'],
  queryFn: () => window.desktop.getProviderStatus(),
})

const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'],
  queryFn: () => window.desktop.listConversations(),
})

function conversationQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ['conversation', conversationId],
    queryFn: () => window.desktop.getConversation({ conversationId }),
  })
}

function createConversationId(): string {
  return `conversation-${crypto.randomUUID()}`
}

function updateStreamingState(current: Record<string, StreamingRunState>, event: RunEvent) {
  if (event.type === 'run.created') {
    return {
      ...current,
      [event.runId]: {
        conversationId: event.payload.run.conversationId,
        content: '',
        isStreaming: false,
      },
    }
  }

  if (event.type === 'provider.delta') {
    const existing = current[event.runId]

    if (!existing) {
      return current
    }

    return {
      ...current,
      [event.runId]: {
        ...existing,
        content: `${existing.content}${event.payload.delta}`,
        isStreaming: true,
      },
    }
  }

  if (event.type === 'provider.error') {
    const existing = current[event.runId]

    if (!existing) {
      return current
    }

    return {
      ...current,
      [event.runId]: {
        ...existing,
        isStreaming: false,
        errorMessage: event.payload.message,
      },
    }
  }

  if (event.type === 'run.completed' || event.type === 'run.cancelled' || event.type === 'run.failed') {
    const nextState = { ...current }
    delete nextState[event.runId]
    return nextState
  }

  return current
}

function updateLiveRunEvents(current: Record<string, RunEvent[]>, event: RunEvent) {
  const nextEvents = [...(current[event.runId] ?? []), event].slice(-200)

  return {
    ...current,
    [event.runId]: nextEvents,
  }
}

function mergeRunEvents(persistedEvents: RunEvent[], liveEvents: RunEvent[]) {
  const mergedEvents = new Map<string, RunEvent>()

  for (const event of persistedEvents) {
    mergedEvents.set(event.id, event)
  }

  for (const event of liveEvents) {
    mergedEvents.set(event.id, event)
  }

  return [...mergedEvents.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

function formatRelativeTimestamp(value: string) {
  const deltaMs = Date.now() - new Date(value).getTime()
  const deltaMinutes = Math.round(deltaMs / 60000)

  if (Math.abs(deltaMinutes) < 1) {
    return 'just now'
  }

  if (Math.abs(deltaMinutes) < 60) {
    return `${deltaMinutes}m ago`
  }

  const deltaHours = Math.round(deltaMinutes / 60)

  if (Math.abs(deltaHours) < 24) {
    return `${deltaHours}h ago`
  }

  const deltaDays = Math.round(deltaHours / 24)
  return `${deltaDays}d ago`
}

function previewText(value: string, maxLength = 120) {
  const normalized = value.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return 'No additional detail.'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized
}

function describeRunEvent(event: RunEvent) {
  switch (event.type) {
    case 'run.created':
      return {
        title: 'Run created',
        detail: `Conversation ${event.payload.run.conversationId}`,
      }
    case 'run.started':
      return {
        title: 'Run started',
        detail: `Execution began at ${formatTimestamp(event.payload.startedAt)}`,
      }
    case 'run.waiting_approval':
      return {
        title: 'Waiting for approval',
        detail: `Approval request ${event.payload.approvalRequestId}`,
      }
    case 'run.completed':
      return {
        title: 'Run completed',
        detail: `Finished at ${formatTimestamp(event.payload.finishedAt)}`,
      }
    case 'run.failed':
      return {
        title: 'Run failed',
        detail: event.payload.message,
      }
    case 'run.cancelled':
      return {
        title: 'Run cancelled',
        detail: event.payload.reason ?? 'Cancelled without a recorded reason.',
      }
    case 'provider.requested':
      return {
        title: 'Provider request sent',
        detail: `Model: ${event.payload.model}`,
      }
    case 'provider.delta':
      return {
        title: 'Provider streamed delta',
        detail: previewText(event.payload.delta, 160),
      }
    case 'provider.completed':
      return {
        title: 'Provider stream completed',
        detail: `Assistant message ${event.payload.messageId}`,
      }
    case 'provider.error':
      return {
        title: 'Provider error surfaced',
        detail: event.payload.message,
      }
    case 'action.requested':
      return {
        title: `Action requested: ${event.payload.actionCall.actionId}`,
        detail: previewText(JSON.stringify(event.payload.actionCall.input)),
      }
    case 'action.started':
      return {
        title: 'Action started',
        detail: `Call ${event.payload.actionCallId}`,
      }
    case 'action.completed':
      return {
        title: 'Action completed',
        detail: previewText(JSON.stringify(event.payload.result.output)),
      }
    case 'action.failed':
      return {
        title: 'Action failed',
        detail: event.payload.result.errorMessage ?? 'Action returned a failed result.',
      }
    case 'approval.required':
      return {
        title: 'Approval required',
        detail: event.payload.approvalRequest.reason,
      }
    case 'approval.granted':
      return {
        title: 'Approval granted',
        detail: `Resolved at ${formatTimestamp(event.payload.resolution.decidedAt)}`,
      }
    case 'approval.rejected':
      return {
        title: 'Approval rejected',
        detail: `Resolved at ${formatTimestamp(event.payload.resolution.decidedAt)}`,
      }
    case 'message.created':
      return {
        title: `${event.payload.message.role} message persisted`,
        detail: previewText(event.payload.message.content, 160),
      }
  }
}

function getEventFamily(eventType: RunEvent['type']) {
  return eventType.split('.')[0]
}

function getRecoverableRunAction(run: ConversationSnapshot['runs'][number], pendingApproval: ApprovalRequest | null) {
  if (run.status === 'created' || run.status === 'started') {
    return 'resume'
  }

  if (run.status === 'waiting_approval' && !pendingApproval) {
    return 'resume'
  }

  return null
}

function getPendingApproval(snapshot: ConversationSnapshot | undefined, runId: string | null): ApprovalRequest | null {
  if (!snapshot || !runId) {
    return null
  }

  const resolvedRequestIds = new Set(snapshot.approvalResolutions.map((resolution) => resolution.approvalRequestId))

  return (
    [...snapshot.approvalRequests]
      .reverse()
      .find((request) => request.runId === runId && !resolvedRequestIds.has(request.id)) ?? null
  )
}

function applyProviderDefaults(settings: AppSettings, providerKey: AppSettings['provider']['provider']): AppSettings {
  const provider = getProviderDefinition(providerKey)

  return {
    ...settings,
    provider: {
      ...settings.provider,
      provider: provider.key,
      model: provider.defaultModel,
    },
  }
}

function RuntimeUiProvider() {
  const queryClient = useQueryClient()
  const { data: context } = useQuery(contextQueryOptions)
  const [recentEvents, setRecentEvents] = useState<RunEvent[]>([])
  const [liveRunEvents, setLiveRunEvents] = useState<Record<string, RunEvent[]>>({})
  const [streamingRuns, setStreamingRuns] = useState<Record<string, StreamingRunState>>({})
  const [showTechnicalInfo, setShowTechnicalInfo] = useState(false)

  useEffect(() => {
    const unsubscribe = window.desktop.onRunEvent((event) => {
      startTransition(() => {
        setRecentEvents((currentEvents) => [event, ...currentEvents].slice(0, 20))
        setLiveRunEvents((currentEvents) => updateLiveRunEvents(currentEvents, event))
        setStreamingRuns((currentRuns) => updateStreamingState(currentRuns, event))
      })

      if (
        event.type === 'run.created' ||
        event.type === 'message.created' ||
        event.type.startsWith('approval.') ||
        event.type.startsWith('action.')
      ) {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] })
        void queryClient.invalidateQueries({ queryKey: ['conversation'] })
      }

      if (event.type.startsWith('run.')) {
        void queryClient.invalidateQueries({ queryKey: ['conversation'] })
      }
    })

    return unsubscribe
  }, [queryClient])

  return (
    <TechnicalUiContext.Provider
      value={{
        showTechnicalInfo,
        toggleTechnicalInfo: () => setShowTechnicalInfo((current) => !current),
      }}
    >
      <RuntimeUiContext.Provider
        value={{
          context: context ?? null,
          recentEvents,
          liveRunEvents,
          streamingRuns,
        }}
      >
        <RouterProvider router={router} />
      </RuntimeUiContext.Provider>
    </TechnicalUiContext.Provider>
  )
}

function RootLayout() {
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

function HomeRoute() {
  return (
    <div className="panel-stack">
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Chat</p>
        <h2>Start a new conversation</h2>
        <p className="muted-copy">
          Send a prompt to create a conversation, persist it locally, and watch the assistant stream back through the desktop bridge.
        </p>
      </section>
      <ComposerCard conversationId={null} />
    </div>
  )
}

function ConversationRoute() {
  const { conversationId } = useParams({ from: '/conversations/$conversationId' })
  const { showTechnicalInfo } = useTechnicalUi()
  const snapshotQuery = useQuery(conversationQueryOptions(conversationId))
  const { liveRunEvents, streamingRuns } = useRuntimeUi()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    const runs = snapshotQuery.data?.runs ?? []

    if (runs.length === 0) {
      setSelectedRunId(null)
      return
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs.at(-1)?.id ?? null)
    }
  }, [selectedRunId, snapshotQuery.data?.runs])

  const streamingEntry = useMemo(() => {
    return Object.entries(streamingRuns).find(([, run]) => run.conversationId === conversationId)
  }, [conversationId, streamingRuns])

  const selectedRun = useMemo(() => {
    return snapshotQuery.data?.runs.find((run) => run.id === selectedRunId) ?? null
  }, [selectedRunId, snapshotQuery.data?.runs])

  const selectedRunEvents = useMemo(() => {
    if (!selectedRunId) {
      return []
    }

    return mergeRunEvents(
      snapshotQuery.data?.events.filter((event) => event.runId === selectedRunId) ?? [],
      liveRunEvents[selectedRunId] ?? [],
    )
  }, [liveRunEvents, selectedRunId, snapshotQuery.data?.events])

  const pendingApproval = useMemo(() => {
    return getPendingApproval(snapshotQuery.data, selectedRunId)
  }, [selectedRunId, snapshotQuery.data])

  if (snapshotQuery.isError) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Conversation</p>
        <h2>Failed to load conversation</h2>
        <p className="error-copy">
          {snapshotQuery.error instanceof Error ? snapshotQuery.error.message : 'The conversation snapshot could not be loaded.'}
        </p>
      </section>
    )
  }

  if (!snapshotQuery.isLoading && !snapshotQuery.data?.conversation) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Conversation</p>
        <h2>Conversation not found</h2>
        <p className="muted-copy">This conversation may have been removed or has not been created yet.</p>
      </section>
    )
  }

  return (
    <div className={`conversation-grid ${showTechnicalInfo ? 'conversation-grid-technical' : 'conversation-grid-simple'}`}>
      <div className="panel-stack">
        <section className="panel-card panel-card-hero">
          <p className="eyebrow">Conversation</p>
          <h2>{snapshotQuery.data?.conversation?.title ?? 'Loading conversation...'}</h2>
          {showTechnicalInfo ? (
            <p className="muted-copy">
              Messages are persisted in SQLite and the run inspector shows the same event model both live and after relaunch.
            </p>
          ) : null}
        </section>

        <section className="panel-card transcript-panel">
          {snapshotQuery.isLoading ? <p className="muted-copy">Loading messages...</p> : null}
          {!snapshotQuery.isLoading && snapshotQuery.data ? (
            <ChatTranscript snapshot={snapshotQuery.data} streamingEntry={streamingEntry ?? null} />
          ) : null}
        </section>

        <ComposerCard conversationId={conversationId} />
      </div>

      {showTechnicalInfo ? (
        <div className="panel-stack">
          <RunListCard
            runs={snapshotQuery.data?.runs ?? []}
            selectedRunId={selectedRunId}
            onSelectRun={(runId) => setSelectedRunId(runId)}
          />
          <RunInspectorCard
            run={selectedRun}
            events={selectedRunEvents}
            pendingApproval={pendingApproval}
            streamingState={selectedRun ? streamingRuns[selectedRun.id] ?? null : null}
          />
        </div>
      ) : null}
    </div>
  )
}

function RunListCard({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: ConversationSnapshot['runs']
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}) {
  const sortedRuns = [...runs].reverse()

  return (
    <section className="panel-card inspector-card">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Runs</p>
          <h2>Conversation history</h2>
        </div>
        <span className="runtime-pill">{runs.length} total</span>
      </div>

      {sortedRuns.length === 0 ? <p className="muted-copy">No runs yet for this conversation.</p> : null}

      <div className="run-list">
        {sortedRuns.map((run) => (
          <button
            key={run.id}
            type="button"
            className={`run-card ${selectedRunId === run.id ? 'run-card-active' : ''}`}
            onClick={() => onSelectRun(run.id)}
          >
            <div className="run-card-header">
              <strong>{run.status}</strong>
              <span className={`status-badge status-${run.status}`}>{run.status}</span>
            </div>
            <small>{formatTimestamp(run.createdAt)}</small>
            {run.failureMessage ? <span className="error-copy">{run.failureMessage}</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}

function RunInspectorCard({
  run,
  events,
  pendingApproval,
  streamingState,
}: {
  run: ConversationSnapshot['runs'][number] | null
  events: RunEvent[]
  pendingApproval: ApprovalRequest | null
  streamingState: StreamingRunState | null
}) {
  const queryClient = useQueryClient()
  const recoverableAction = run ? getRecoverableRunAction(run, pendingApproval) : null
  const runControlMutation = useMutation({
    mutationFn: async (action: 'resume' | 'cancel') => {
      if (!run) {
        throw new Error('No run is selected')
      }

      if (action === 'resume') {
        await window.desktop.resumeRun({ runId: run.id })
        return
      }

      await window.desktop.cancelRun({ runId: run.id })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversation'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
  const approvalMutation = useMutation({
    mutationFn: async (decision: 'granted' | 'rejected') => {
      if (!run || !pendingApproval) {
        throw new Error('No pending approval is available')
      }

      await window.desktop.resolveApproval({
        runId: run.id,
        approvalRequestId: pendingApproval.id,
        decision,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conversation'] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  return (
    <section className="panel-card inspector-card">
      <p className="eyebrow">Inspector</p>
      <div className="sidebar-header-row">
        <h2>{run ? 'Run timeline' : 'Select a run'}</h2>
        {run ? (
          <div className="status-row">
            <span className={`status-badge status-${run.status}`}>{run.status}</span>
            {streamingState?.isStreaming ? <span className="status-badge status-streaming">streaming</span> : null}
          </div>
        ) : null}
      </div>

      {run && (recoverableAction || run.status === 'started' || run.status === 'waiting_approval') ? (
        <div className="run-controls">
          {recoverableAction ? (
            <button
              type="button"
              className="ghost-button"
              disabled={runControlMutation.isPending}
              onClick={() => runControlMutation.mutate('resume')}
            >
              {runControlMutation.isPending ? 'Working...' : 'Resume run'}
            </button>
          ) : null}
          {(run.status === 'created' || run.status === 'started' || run.status === 'waiting_approval') ? (
            <button
              type="button"
              className="ghost-button"
              disabled={runControlMutation.isPending}
              onClick={() => runControlMutation.mutate('cancel')}
            >
              Cancel run
            </button>
          ) : null}
        </div>
      ) : null}

      {!run ? <p className="muted-copy">Choose a run to inspect its persisted and live event sequence.</p> : null}

      {run ? (
        <>
          <div className="inspector-summary">
            <div>
              <span className="field-label">Created</span>
              <p>{formatTimestamp(run.createdAt)}</p>
            </div>
            <div>
              <span className="field-label">Started</span>
              <p>{run.startedAt ? formatTimestamp(run.startedAt) : 'Not started yet'}</p>
            </div>
            <div>
              <span className="field-label">Finished</span>
              <p>{run.finishedAt ? formatTimestamp(run.finishedAt) : 'Still active'}</p>
            </div>
          </div>

          {run.failureMessage ? <p className="error-copy">{run.failureMessage}</p> : null}
          {!run.failureMessage && streamingState?.errorMessage ? <p className="error-copy">{streamingState.errorMessage}</p> : null}
          {runControlMutation.error instanceof Error ? <p className="error-copy">{runControlMutation.error.message}</p> : null}

          {pendingApproval ? (
            <section className="approval-card">
              <div className="sidebar-header-row">
                <div>
                  <p className="eyebrow">Approval</p>
                  <h3>Action requires confirmation</h3>
                </div>
                <span className="status-badge status-waiting_approval">pending</span>
              </div>
              <p className="muted-copy">{pendingApproval.reason}</p>
              <small className="muted-copy">Requested at {formatTimestamp(pendingApproval.requestedAt)}</small>
              <div className="approval-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate('rejected')}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={approvalMutation.isPending}
                  onClick={() => approvalMutation.mutate('granted')}
                >
                  {approvalMutation.isPending ? 'Submitting...' : 'Grant approval'}
                </button>
              </div>
              {approvalMutation.error instanceof Error ? <p className="error-copy">{approvalMutation.error.message}</p> : null}
            </section>
          ) : null}

          {events.length === 0 ? <p className="muted-copy">No events captured for this run yet.</p> : null}

          <ol className="timeline-list">
            {events.map((event) => {
              const description = describeRunEvent(event)

              return (
                <li key={event.id} className="timeline-item">
                  <div className={`timeline-dot timeline-${getEventFamily(event.type)}`} />
                  <div className="timeline-card">
                    <div className="timeline-header">
                      <strong>{description.title}</strong>
                      <small>{formatTimestamp(event.timestamp)}</small>
                    </div>
                    <p className="timeline-type">{event.type}</p>
                    <p className="muted-copy">{description.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}
    </section>
  )
}

function SettingsRoute() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const mutation = useMutation({
    mutationFn: async (settings: AppSettings) => window.desktop.saveSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
    },
  })

  if (!settingsQuery.data) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Settings</p>
        <h2>Loading provider settings...</h2>
      </section>
    )
  }

  return (
    <SettingsFormCard
      key={JSON.stringify(settingsQuery.data)}
      initialSettings={settingsQuery.data}
      providerStatus={providerStatusQuery.data ?? null}
      isSaving={mutation.isPending}
      saveError={mutation.error instanceof Error ? mutation.error.message : null}
      onSubmit={async (settings) => {
        await mutation.mutateAsync(settings)
      }}
    />
  )
}

function ChatTranscript({
  snapshot,
  streamingEntry,
}: {
  snapshot: ConversationSnapshot
  streamingEntry: [string, StreamingRunState] | null
}) {
  return (
    <div className="transcript-list">
      {snapshot.messages.length === 0 ? <p className="muted-copy">No persisted messages yet.</p> : null}

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
          {message.role === 'assistant' ? (
            <Streamdown>{message.content}</Streamdown>
          ) : (
            <pre className="message-pre">{message.content}</pre>
          )}
        </article>
      ))}

      {streamingEntry && streamingEntry[1].content ? (
        <article className="message-bubble message-assistant message-streaming">
          <header className="message-meta">assistant streaming</header>
          <Streamdown isAnimating mode="streaming">
            {streamingEntry[1].content}
          </Streamdown>
        </article>
      ) : null}

      {streamingEntry?.[1].errorMessage ? <p className="error-copy">{streamingEntry[1].errorMessage}</p> : null}
    </div>
  )
}

function ComposerCard({ conversationId }: { conversationId: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const startRunMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const nextConversationId = conversationId ?? createConversationId()
      const result = await window.desktop.startRun({
        conversationId: nextConversationId,
        prompt,
      })

      return {
        conversationId: nextConversationId,
        runId: result.runId,
      }
    },
    onSuccess: async ({ conversationId: nextConversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', nextConversationId] }),
      ])

      await navigate({
        to: '/conversations/$conversationId',
        params: { conversationId: nextConversationId },
      })
    },
  })

  const form = useForm({
    defaultValues: {
      prompt: '',
    },
    onSubmit: async ({ value }) => {
      const prompt = value.prompt.trim()

      if (!prompt) {
        setSubmitError('Enter a prompt before sending.')
        return
      }

      setSubmitError(null)
      await startRunMutation.mutateAsync(prompt)
      form.reset()
    },
  })

  return (
    <section className="panel-card composer-card">
      <div className="sidebar-header-row">
        <h2>{conversationId ? 'Continue conversation' : 'First prompt'}</h2>
        {startRunMutation.isPending ? <span className="runtime-pill">Sending...</span> : null}
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field
          name="prompt"
          children={(field) => (
            <textarea
              className="text-input composer-input"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Ask the local harness to summarize a file, explain a bug, or sketch a plan."
              rows={5}
            />
          )}
        />

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={startRunMutation.isPending}>
            Send prompt
          </button>
        </div>
      </form>

      {providerStatusQuery.data && !providerStatusQuery.data.isReady ? (
        <p className="warning-copy">
          Provider setup is incomplete. Update settings before expecting a successful hosted-provider response.
        </p>
      ) : null}
      {submitError ? <p className="error-copy">{submitError}</p> : null}
      {startRunMutation.error instanceof Error ? <p className="error-copy">{startRunMutation.error.message}</p> : null}
    </section>
  )
}

function SettingsFormCard({
  initialSettings,
  providerStatus,
  isSaving,
  saveError,
  onSubmit,
}: {
  initialSettings: AppSettings
  providerStatus: ProviderStatus | null
  isSaving: boolean
  saveError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      const normalizedSettings: AppSettings = {
        provider: {
          provider: value.provider.provider,
          model: value.provider.model.trim(),
          apiKey: value.provider.apiKey.trim(),
        },
        workspace: {
          ...value.workspace,
          rootPath: value.workspace.rootPath.trim(),
        },
      }

      await onSubmit(normalizedSettings)
      setSaveMessage('Settings saved.')
    },
  })

  return (
    <section className="panel-card settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Provider configuration</h2>
      <p className="muted-copy">
        Choose a provider, enter your API key, and select a model. Endpoint details are managed internally.
      </p>

      {providerStatus ? (
        <section className="provider-status-card">
          <div className="sidebar-header-row">
            <div>
              <p className="eyebrow">Provider status</p>
              <h3>{providerStatus.providerLabel}</h3>
            </div>
            <span className={`status-badge ${providerStatus.isReady ? 'status-completed' : 'status-waiting_approval'}`}>
              {providerStatus.isReady ? 'ready' : 'check setup'}
            </span>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Model</dt>
              <dd>{providerStatus.model}</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>
                {providerStatus.apiKeyLabel} {providerStatus.apiKeyPresent ? '(configured)' : '(missing)'}
              </dd>
            </div>
          </dl>
          {providerStatus.issues.map((issue) => (
            <p key={issue} className="error-copy">
              {issue}
            </p>
          ))}
          {providerStatus.hints.map((hint) => (
            <p key={hint} className="muted-copy">
              {hint}
            </p>
          ))}
        </section>
      ) : null}

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setSaveMessage(null)
          void form.handleSubmit()
        }}
      >
        <LabeledField label="Provider">
          <FieldHint>Select the hosted provider you want to use.</FieldHint>
          <form.Field
            name="provider.provider"
            children={(field) => (
              <select
                className="text-input"
                value={field.state.value}
                onChange={(event) => {
                  const nextProvider = event.target.value as AppSettings['provider']['provider']
                  field.handleChange(nextProvider)
                  const nextSettings = applyProviderDefaults(form.state.values, nextProvider)
                  form.setFieldValue('provider.model', nextSettings.provider.model)
                }}
              >
                {providerOptions.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}
                  </option>
                ))}
              </select>
            )}
          />
          <div className="preset-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
              }}
            >
              Use defaults
            </button>
          </div>
        </LabeledField>

        <LabeledField label="Model">
          <FieldHint>
            Choose a model available for your selected provider.
          </FieldHint>
          <form.Field
            name="provider.model"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Model is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="x-ai/grok-4.1-fast" />}
          />
        </LabeledField>

        <LabeledField label="API Key">
          <FieldHint>Your key is stored in the app settings so hosted-provider runs work without extra shell setup.</FieldHint>
          <form.Field
            name="provider.apiKey"
            children={(field) => <TextField field={field} placeholder="Paste API key" inputType="password" />}
          />
        </LabeledField>

        <LabeledField label="Workspace Root">
          <FieldHint>Built-in file actions are restricted to this directory tree.</FieldHint>
          <form.Field
            name="workspace.rootPath"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Workspace root is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="/Users/name/project" />}
          />
        </LabeledField>

        <LabeledField label="Approval Policy">
          <form.Field
            name="workspace.approvalPolicy"
            children={(field) => (
              <select
                className="text-input"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as AppSettings['workspace']['approvalPolicy'])}
              >
                <option value="on-request">on-request</option>
                <option value="always">always</option>
                <option value="never">never</option>
              </select>
            )}
          />
        </LabeledField>

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>

      {saveMessage ? <p className="success-copy">{saveMessage}</p> : null}
      {saveError ? <p className="error-copy">{saveError}</p> : null}
    </section>
  )
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function FieldHint({ children }: { children: ReactNode }) {
  return <span className="field-hint">{children}</span>
}

function TextField({
  field,
  placeholder,
  inputType,
}: {
  field: {
    state: {
      value: string | undefined
      meta: {
        errors: unknown[]
      }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
  }
  placeholder: string
  inputType?: 'password' | 'text'
}) {
  const firstError = field.state.meta.errors[0]

  return (
    <>
      <input
        className="text-input"
        type={inputType ?? 'text'}
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
      />
      {typeof firstError === 'string' ? <span className="field-error">{firstError}</span> : null}
    </>
  )
}

export function App() {
  if (typeof window === 'undefined' || !('desktop' in window) || !window.desktop) {
    return (
      <main className="workspace-shell workspace-shell-single">
        <section className="panel-card diagnostic-card">
          <p className="eyebrow">Renderer Diagnostic</p>
          <h2>Desktop bridge unavailable</h2>
          <p className="muted-copy">
            The renderer loaded, but `window.desktop` was not exposed by preload. In a normal Electron run this means the preload script failed to load.
          </p>
          <p className="error-copy">
            If you opened `http://localhost:5173/` in a browser tab directly, this screen is expected because the preload bridge only exists inside Electron.
          </p>
        </section>
      </main>
    )
  }

  return <RuntimeUiProvider />
}
