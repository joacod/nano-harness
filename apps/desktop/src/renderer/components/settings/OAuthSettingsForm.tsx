import { useState } from 'react'

import type { AppSettings, ProviderStatus } from '../../../../../../packages/shared/src'
import { Button, FeedbackText } from '../ui'

export function OAuthSettingsForm({
  authError,
  isClearingAuth,
  isStartingOauth,
  provider,
  providerStatus,
  onClearOauth,
  onStartOauth,
}: {
  authError: string | null
  isClearingAuth: boolean
  isStartingOauth: boolean
  provider: AppSettings['provider']['provider']
  providerStatus: ProviderStatus | null
  onClearOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onStartOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<{ accountId?: string }>
}) {
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const oauthStatus = providerStatus?.authMethods?.find((method) => method.authMethod === 'oauth')
  const accountId = oauthStatus?.accountId

  return (
    <>
      <section className="settings-mini-section settings-form" aria-labelledby="provider-oauth-heading">
        <div className="settings-section-heading">
          <p className="eyebrow" id="provider-oauth-heading">
            ChatGPT Sign In
          </p>
          <p>Connect your ChatGPT subscription in the browser. Tokens stay encrypted on this device and are not included in backups.</p>
        </div>

        <dl className="summary-list">
          <div>
            <dt>Status</dt>
            <dd>{oauthStatus?.present ? 'Connected' : 'Not connected'}</dd>
          </div>
          {accountId ? (
            <div>
              <dt>Account</dt>
              <dd>{accountId}</dd>
            </div>
          ) : null}
        </dl>

        <div className="form-row action-row-left">
          <Button
            type="button"
            variant="primary"
            disabled={isStartingOauth}
            onClick={() => {
              setAuthMessage(null)
              void onStartOauth({ provider }).then((result) => {
                setAuthMessage(result.accountId ? `Connected ChatGPT account ${result.accountId}.` : 'Connected ChatGPT account.')
              })
            }}
          >
            {isStartingOauth ? 'Opening browser…' : oauthStatus?.present ? 'Reconnect ChatGPT' : 'Sign in with ChatGPT'}
          </Button>
          <Button
            type="button"
            disabled={isClearingAuth || !oauthStatus?.present}
            onClick={() => {
              setAuthMessage(null)
              void onClearOauth({ provider }).then(() => {
                setAuthMessage('ChatGPT sign-in cleared.')
              })
            }}
          >
            {isClearingAuth ? 'Clearing…' : 'Clear ChatGPT sign-in'}
          </Button>
        </div>
      </section>

      {authMessage ? (
        <FeedbackText variant="success" live>
          {authMessage}
        </FeedbackText>
      ) : null}
      {authError ? (
        <FeedbackText variant="error" live>
          {authError}
        </FeedbackText>
      ) : null}
    </>
  )
}
