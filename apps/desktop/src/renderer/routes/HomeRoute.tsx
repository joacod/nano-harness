import { RunInspectorCard } from '../components/RunInspectorCard'
import { RunListCard } from '../components/RunListCard'
import { SessionLayout } from '../components/SessionLayout'
import { useTechnicalUi } from '../runtime-ui'

export function HomeRoute() {
  const { showTechnicalInfo } = useTechnicalUi()

  return (
    <SessionLayout
      conversationId={null}
      showTechnicalInfo={showTechnicalInfo}
      title="Start new session"
      inspectorChildren={(
        <>
          <RunListCard runs={[]} events={[]} selectedRunId={null} onSelectRun={() => undefined} />
          <RunInspectorCard run={null} events={[]} pendingApproval={null} streamingState={null} />
        </>
      )}
    />
  )
}
