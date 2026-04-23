import { useEffect, useState } from 'react'

import type { AppSettings, ConversationSnapshot, DesktopContext, RunEvent } from '../../../../packages/shared/src'

const probeConversationId = 'desktop-probe'
const probePrompt = 'Say hello in one short sentence.'

export function App() {
  const [context, setContext] = useState<DesktopContext | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isStartingRun, setIsStartingRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshConversation(): Promise<void> {
    setSnapshot(await window.desktop.getConversation({ conversationId: probeConversationId }))
  }

  useEffect(() => {
    void (async () => {
      try {
        const [nextContext, nextSettings] = await Promise.all([
          window.desktop.getContext(),
          window.desktop.getSettings(),
        ])

        setContext(nextContext)
        setSettings(nextSettings)
        await refreshConversation()
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load desktop runtime')
      }
    })()

    const unsubscribe = window.desktop.onRunEvent((event) => {
      setEvents((currentEvents) => [event, ...currentEvents].slice(0, 12))

      if (event.type === 'message.created' || event.type.startsWith('run.')) {
        void refreshConversation()
      }
    })

    return unsubscribe
  }, [])

  async function handleStartProbeRun(): Promise<void> {
    setIsStartingRun(true)
    setError(null)

    try {
      await window.desktop.startRun({
        conversationId: probeConversationId,
        prompt: probePrompt,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start probe run')
    } finally {
      setIsStartingRun(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Desktop Composition</p>
        <h1>nano-harness</h1>
        <p className="lede">
          Electron now assembles the runtime and forwards typed run events across the preload bridge.
        </p>
        <dl className="meta-grid">
          <div>
            <dt>Shell</dt>
            <dd>Electron desktop app</dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>React + Vite</dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>core, infra, shared</dd>
          </div>
          <div>
            <dt>Bridge</dt>
            <dd>{context ? `${context.platform} / v${context.version}` : 'Loading...'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{settings?.provider.providerId ?? 'Unconfigured'}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{settings?.provider.model ?? 'Unconfigured'}</dd>
          </div>
        </dl>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <button type="button" onClick={() => void refreshConversation()}>
            Refresh Snapshot
          </button>
          <button type="button" onClick={() => void handleStartProbeRun()} disabled={isStartingRun}>
            {isStartingRun ? 'Starting...' : 'Start Probe Run'}
          </button>
        </div>

        {error ? <p style={{ color: '#fda4af', marginTop: '1rem' }}>{error}</p> : null}

        <section style={{ marginTop: '1.5rem' }}>
          <h2>Conversation Snapshot</h2>
          <p>Conversation: {snapshot?.conversation?.title ?? 'Not created yet'}</p>
          <p>Messages: {snapshot?.messages.length ?? 0}</p>
          <p>Runs: {snapshot?.runs.length ?? 0}</p>
          <p>Latest assistant message: {snapshot?.messages.filter((message) => message.role === 'assistant').at(-1)?.content ?? 'None yet'}</p>
        </section>

        <section style={{ marginTop: '1.5rem' }}>
          <h2>Recent Events</h2>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {events.length > 0 ? (
              events.map((event) => <li key={event.id}>{event.type}</li>)
            ) : (
              <li>No runtime events yet.</li>
            )}
          </ul>
        </section>
      </section>
    </main>
  )
}
