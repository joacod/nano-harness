import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings, ProviderStatus } from '../../../../../../packages/shared/src'
import { LabeledField, TextField } from '../form-fields'
import { Button, FeedbackText } from '../ui'

export function ApiKeySettingsForm({
  apiKeyError,
  isClearingApiKey,
  isSavingApiKey,
  provider,
  providerStatus,
  onClearApiKey,
  onSaveApiKey,
}: {
  apiKeyError: string | null
  isClearingApiKey: boolean
  isSavingApiKey: boolean
  provider: AppSettings['provider']['provider']
  providerStatus: ProviderStatus | null
  onClearApiKey: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onSaveApiKey: (input: { provider: AppSettings['provider']['provider']; apiKey: string }) => Promise<void>
}) {
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null)
  const form = useForm({
    defaultValues: {
      apiKey: '',
    },
    onSubmit: async ({ value }) => {
      const apiKey = value.apiKey.trim()

      if (!apiKey) {
        setApiKeyMessage(null)
        return
      }

      await onSaveApiKey({ provider, apiKey })
      form.reset()
      setApiKeyMessage('API key saved securely on this device.')
    },
  })

  return (
    <>
      <div
        className="settings-inline-panel settings-form"
        aria-labelledby="provider-api-key-heading"
        onKeyDown={(event) => {
          if (event.key !== 'Enter') {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          setApiKeyMessage(null)
          void form.handleSubmit()
        }}
      >
        <div className="settings-section-heading">
          <p className="eyebrow" id="provider-api-key-heading">
            API Key
          </p>
          <p>Stored securely on this device. Not included in backups.</p>
        </div>

        <div className="settings-field-grid settings-field-grid-compact">
          <div className="settings-field">
            <LabeledField label="API Key">
              <form.Field
                name="apiKey"
                validators={{
                  onChange: ({ value }) => (value.trim() ? undefined : 'API key is required.'),
                }}
                children={(field) => (
                  <TextField
                    field={field}
                    name="api-key"
                    placeholder={providerStatus?.apiKeyPresent ? '********' : 'Paste API key'}
                    autoComplete="off"
                    inputType="password"
                    spellCheck={false}
                  />
                )}
              />
            </LabeledField>
          </div>
        </div>

        <div className="form-row action-row-left">
          <Button
            type="button"
            variant="primary"
            disabled={isSavingApiKey}
            onClick={() => {
              setApiKeyMessage(null)
              void form.handleSubmit()
            }}
          >
            {isSavingApiKey ? 'Saving API key…' : 'Save API key'}
          </Button>
          <Button
            type="button"
            disabled={isClearingApiKey || !providerStatus?.apiKeyPresent}
            onClick={() => {
              setApiKeyMessage(null)
              void onClearApiKey({ provider }).then(() => {
                setApiKeyMessage('API key cleared.')
              })
            }}
          >
            {isClearingApiKey ? 'Clearing…' : 'Clear API key'}
          </Button>
        </div>
      </div>

      {apiKeyMessage ? (
        <FeedbackText variant="success" live>
          {apiKeyMessage}
        </FeedbackText>
      ) : null}
      {apiKeyError ? (
        <FeedbackText variant="error" live>
          {apiKeyError}
        </FeedbackText>
      ) : null}
    </>
  )
}
