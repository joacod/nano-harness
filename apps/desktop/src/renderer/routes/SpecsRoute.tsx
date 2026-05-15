import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'

import { SpecWorkbench } from '../components/specs/SpecWorkbench'
import { Card, FeedbackText, RuntimePill } from '../components/ui'
import { specChangesQueryOptions } from '../queries'

export function SpecsRoute() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const specChangesQuery = useQuery(specChangesQueryOptions)
  const changes = specChangesQuery.data?.changes ?? []
  const activeChanges = changes.filter((change) => change.summary.status !== 'archived' && change.summary.status !== 'verified')
  const selectedChangeId = pathname.startsWith('/specs/') ? decodeURIComponent(pathname.slice('/specs/'.length)) : null

  function handleSelectChange(changeId: string) {
    void navigate({ to: '/specs/$changeId', params: { changeId } })
  }

  return (
    <div className="panel-stack">
      <Card hero>
        <p className="eyebrow">Specs</p>
        <div className="sidebar-header-row">
          <h2>Spec Workbench</h2>
          <RuntimePill tone={activeChanges.length > 0 ? 'ready' : undefined} aria-live="polite">
            {activeChanges.length} active
          </RuntimePill>
        </div>
        <p className="muted-copy">
          Durable spec-driven work will live here. Start with <strong>/spec</strong> in chat, or use this route to inspect local changes from <strong>.nano/specs</strong>.
        </p>
      </Card>

      {specChangesQuery.isLoading ? <Card><FeedbackText>Loading spec changes...</FeedbackText></Card> : null}
      {specChangesQuery.isError ? (
        <Card>
          <FeedbackText variant="error" live>
            Failed to load spec changes.
          </FeedbackText>
        </Card>
      ) : null}
      {!specChangesQuery.isLoading && !specChangesQuery.isError ? (
        <SpecWorkbench changes={changes} initialChangeId={selectedChangeId} onSelectChange={handleSelectChange} />
      ) : null}
    </div>
  )
}
