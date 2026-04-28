import { ComposerCard } from '../components/ComposerCard'
import { Card, FeedbackText } from '../components/ui'

export function HomeRoute() {
  return (
    <div className="panel-stack">
      <Card hero>
        <p className="eyebrow">Command</p>
        <h2>Open a new session</h2>
        <FeedbackText>
          Send an instruction, persist the exchange locally, and watch the runtime stream responses through the desktop bridge.
        </FeedbackText>
      </Card>
      <ComposerCard conversationId={null} />
    </div>
  )
}
