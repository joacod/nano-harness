import type { ProviderStatus } from '../../../../../../packages/shared/src'

import { FeedbackText, StatusBadge } from '../ui'

export function ProviderStatusPanel({ providerStatus }: { providerStatus: ProviderStatus }) {
  return (
    <section className="provider-status-card">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Provider status</p>
          <h3>{providerStatus.providerLabel}</h3>
        </div>
        <StatusBadge status={providerStatus.isReady ? 'completed' : 'waiting_approval'}>
          {providerStatus.isReady ? 'ready' : 'check setup'}
        </StatusBadge>
      </div>
      <dl className="summary-list">
        <div>
          <dt>Model</dt>
          <dd>{providerStatus.model}</dd>
        </div>
        <div>
          <dt>Base URL</dt>
          <dd>{providerStatus.baseUrl}</dd>
        </div>
        <div>
          <dt>API key</dt>
          <dd>
            {providerStatus.apiKeyLabel} {providerStatus.apiKeyPresent ? '(configured)' : providerStatus.isReady ? '(not required)' : '(missing)'}
          </dd>
        </div>
      </dl>
      {providerStatus.issues.map((issue) => (
        <FeedbackText key={issue} variant="error">
          {issue}
        </FeedbackText>
      ))}
      {providerStatus.hints.map((hint) => (
        <FeedbackText key={hint}>{hint}</FeedbackText>
      ))}
    </section>
  )
}
