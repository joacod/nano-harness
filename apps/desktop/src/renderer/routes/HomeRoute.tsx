import { SessionLayout } from '../components/SessionLayout'
import { SessionTelemetry } from '../components/SessionTelemetry'
import { useTechnicalUi } from '../runtime-ui'

export function HomeRoute() {
  const { advancedSettings, isAdvancedUiActive } = useTechnicalUi()

  return (
    <SessionLayout
      conversationId={null}
      showTechnicalInfo={isAdvancedUiActive && advancedSettings.telemetrySidebar}
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
          onRunEvidenceExported={() => undefined}
          onRunEvidenceExportError={() => undefined}
        />
      )}
    />
  )
}
