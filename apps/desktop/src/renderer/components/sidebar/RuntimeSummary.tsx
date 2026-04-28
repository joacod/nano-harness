import { useQuery } from '@tanstack/react-query'

import { getProviderDefinition, type DesktopContext } from '../../../../../../packages/shared/src'
import { providerStatusQueryOptions, settingsQueryOptions } from '../../queries'
import { FeedbackText, RuntimePill } from '../ui'

export function RuntimeSummary({ context }: { context: DesktopContext | null }) {
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const settings = settingsQuery.data
  const providerStatus = providerStatusQuery.data

  return (
    <div className="sidebar-section sidebar-collapsible-content">
      <div className="sidebar-header-row sidebar-header-row-stacked">
        <h2>Configuration</h2>
        {providerStatus ? (
          <RuntimePill tone={providerStatus.isReady ? 'ready' : 'warning'}>
            {providerStatus.isReady ? 'ready' : 'action needed'}
          </RuntimePill>
        ) : null}
      </div>
      {settingsQuery.isLoading ? <FeedbackText>Loading configuration…</FeedbackText> : null}
      {settingsQuery.isError ? (
        <FeedbackText variant="error" live>
          Failed to load provider settings.
        </FeedbackText>
      ) : null}
      {settings ? (
        <dl className="summary-list">
          <div>
            <dt>Provider</dt>
            <dd>{providerStatus?.providerLabel ?? getProviderDefinition(settings.provider.provider).label}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{settings.provider.model}</dd>
          </div>
          <div>
            <dt>API key</dt>
            <dd>{providerStatus?.apiKeyPresent ? 'Configured' : 'Missing'}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{settings.workspace.rootPath}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{context ? `${context.platform} / v${context.version}` : 'Loading runtime…'}</dd>
          </div>
        </dl>
      ) : null}
      {providerStatus && providerStatus.issues.length > 0 ? (
        <div className="status-note-block">
          {providerStatus.issues.map((issue) => (
            <FeedbackText key={issue} variant="error" live>
              {issue}
            </FeedbackText>
          ))}
        </div>
      ) : null}
    </div>
  )
}
