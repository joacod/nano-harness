import { useQuery } from '@tanstack/react-query'

import { Card, FeedbackText, RuntimePill } from '../components/ui'
import { specChangesQueryOptions } from '../queries'

export function SpecsRoute() {
  const specChangesQuery = useQuery(specChangesQueryOptions)
  const changes = specChangesQuery.data?.changes ?? []
  const activeChanges = changes.filter((change) => change.summary.status !== 'archived' && change.summary.status !== 'verified')

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

      <Card>
        <p className="eyebrow">Local changes</p>
        <h2>Workbench skeleton</h2>
        {specChangesQuery.isLoading ? <FeedbackText>Loading spec changes...</FeedbackText> : null}
        {specChangesQuery.isError ? (
          <FeedbackText variant="error" live>
            Failed to load spec changes.
          </FeedbackText>
        ) : null}
        {!specChangesQuery.isLoading && !specChangesQuery.isError && changes.length === 0 ? (
          <FeedbackText>
            No spec changes yet. Start with /spec in chat, or create a local spec change for work that needs a plan, tasks, validation, and evidence.
          </FeedbackText>
        ) : null}
        {!specChangesQuery.isLoading && !specChangesQuery.isError && changes.length > 0 ? (
          <div className="settings-card-list" aria-label="Spec changes">
            {changes.slice(0, 8).map((change) => (
              <article key={change.summary.id} className="settings-card-item">
                <div>
                  <strong>{change.summary.title}</strong>
                  <p>{change.summary.id}</p>
                </div>
                <RuntimePill>{change.summary.status}</RuntimePill>
              </article>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
