import { ComposerCard } from '../components/ComposerCard'

export function HomeRoute() {
  return (
    <div className="panel-stack">
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Command</p>
        <h2>Open a new session</h2>
        <p className="muted-copy">
          Send an instruction, persist the exchange locally, and watch the runtime stream responses through the desktop bridge.
        </p>
      </section>
      <ComposerCard conversationId={null} />
    </div>
  )
}
