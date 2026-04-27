import { ComposerCard } from '../components/ComposerCard'

export function HomeRoute() {
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
