import { SessionLayout } from '../components/SessionLayout'
import { SessionTelemetry } from '../components/SessionTelemetry'
import { useTechnicalUi } from '../runtime-ui'

export function HomeRoute() {
  const { showTechnicalInfo } = useTechnicalUi()

  return (
    <SessionLayout
      conversationId={null}
      showTechnicalInfo={showTechnicalInfo}
      title="Start new session"
      inspectorChildren={(
        <SessionTelemetry
          runs={[]}
          events={[]}
          selectedRunId={null}
          onSelectRun={() => undefined}
          selectedRun={null}
          selectedRunEvents={[]}
          pendingApproval={null}
          streamingState={null}
        />
      )}
    />
  )
}
