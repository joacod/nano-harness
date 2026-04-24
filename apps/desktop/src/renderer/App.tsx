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

import type { AppSettings, ConversationSnapshot, DesktopContext, RunEvent } from '../../../../packages/shared/src'

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
  streamingRuns: Record<string, StreamingRunState>
}

const RuntimeUiContext = createContext<RuntimeUiState | null>(null)

function useRuntimeUi(): RuntimeUiState {
  const value = useContext(RuntimeUiContext)

  if (!value) {
    throw new Error('Runtime UI context is unavailable')
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

function RuntimeUiProvider() {
  const queryClient = useQueryClient()
  const { data: context } = useQuery(contextQueryOptions)
  const [recentEvents, setRecentEvents] = useState<RunEvent[]>([])
  const [streamingRuns, setStreamingRuns] = useState<Record<string, StreamingRunState>>({})

  useEffect(() => {
    const unsubscribe = window.desktop.onRunEvent((event) => {
      startTransition(() => {
        setRecentEvents((currentEvents) => [event, ...currentEvents].slice(0, 20))
        setStreamingRuns((currentRuns) => updateStreamingState(currentRuns, event))
      })

      if (event.type === 'run.created' || event.type === 'message.created') {
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
    <RuntimeUiContext.Provider
      value={{
        context: context ?? null,
        recentEvents,
        streamingRuns,
      }}
    >
      <RouterProvider router={router} />
    </RuntimeUiContext.Provider>
  )
}

function RootLayout() {
  const { context, recentEvents } = useRuntimeUi()
  const { data: conversations = [] } = useQuery(conversationsQueryOptions)

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
            {conversations.length > 0 ? (
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
              <p className="muted-copy">No conversations yet. Start with a prompt.</p>
            )}
          </nav>
        </div>

        <div className="sidebar-section sidebar-footer">
          <Link to="/settings" className="ghost-link" activeProps={{ className: 'ghost-link ghost-link-active' }}>
            Provider Settings
          </Link>
          <p className="runtime-pill">{context ? `${context.platform} / v${context.version}` : 'Loading runtime...'}</p>
        </div>

        <div className="sidebar-section">
          <h2>Recent Events</h2>
          <ul className="event-list">
            {recentEvents.length > 0 ? (
              recentEvents.map((event) => <li key={event.id}>{event.type}</li>)
            ) : (
              <li>No events yet.</li>
            )}
          </ul>
        </div>
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
  const snapshotQuery = useQuery(conversationQueryOptions(conversationId))
  const { streamingRuns } = useRuntimeUi()

  const streamingEntry = useMemo(() => {
    return Object.entries(streamingRuns).find(([, run]) => run.conversationId === conversationId)
  }, [conversationId, streamingRuns])

  return (
    <div className="panel-stack">
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Conversation</p>
        <h2>{snapshotQuery.data?.conversation?.title ?? 'Loading conversation...'}</h2>
        <p className="muted-copy">
          Messages are persisted in SQLite and assistant deltas stream through the event bridge before the final message is committed.
        </p>
      </section>

      <section className="panel-card transcript-panel">
        {snapshotQuery.isLoading ? <p className="muted-copy">Loading messages...</p> : null}
        {!snapshotQuery.isLoading && snapshotQuery.data ? (
          <ChatTranscript snapshot={snapshotQuery.data} streamingEntry={streamingEntry ?? null} />
        ) : null}
      </section>

      <ComposerCard conversationId={conversationId} />
    </div>
  )
}

function SettingsRoute() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(settingsQueryOptions)
  const mutation = useMutation({
    mutationFn: async (settings: AppSettings) => window.desktop.saveSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
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
          <header className="message-meta">{message.role}</header>
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

      {submitError ? <p className="error-copy">{submitError}</p> : null}
      {startRunMutation.error instanceof Error ? <p className="error-copy">{startRunMutation.error.message}</p> : null}
    </section>
  )
}

function SettingsFormCard({
  initialSettings,
  isSaving,
  saveError,
  onSubmit,
}: {
  initialSettings: AppSettings
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
          ...value.provider,
          providerId: value.provider.providerId.trim(),
          model: value.provider.model.trim(),
          apiKeyEnvVar: value.provider.apiKeyEnvVar.trim(),
          baseUrl: value.provider.baseUrl?.trim() || undefined,
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
        These values are stored locally and used by the OpenAI-compatible provider adapter in Electron main.
      </p>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setSaveMessage(null)
          void form.handleSubmit()
        }}
      >
        <LabeledField label="Provider ID">
          <form.Field
            name="provider.providerId"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Provider ID is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="openai-compatible" />}
          />
        </LabeledField>

        <LabeledField label="Model">
          <form.Field
            name="provider.model"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Model is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="gpt-4.1-mini" />}
          />
        </LabeledField>

        <LabeledField label="API Key Env Var">
          <form.Field
            name="provider.apiKeyEnvVar"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'API key environment variable is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="OPENAI_API_KEY" />}
          />
        </LabeledField>

        <LabeledField label="Base URL">
          <form.Field
            name="provider.baseUrl"
            validators={{
              onChange: ({ value }) => {
                if (!value || !value.trim()) {
                  return undefined
                }

                try {
                  new URL(value)
                  return undefined
                } catch {
                  return 'Base URL must be a valid URL.'
                }
              },
            }}
            children={(field) => <TextField field={field} placeholder="https://api.openai.com/v1" />}
          />
        </LabeledField>

        <LabeledField label="Workspace Root">
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

function TextField({
  field,
  placeholder,
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
}) {
  const firstError = field.state.meta.errors[0]

  return (
    <>
      <input
        className="text-input"
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
