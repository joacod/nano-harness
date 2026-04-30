import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings, ProviderStatus } from '../../../../../../packages/shared/src'
import { getProviderDefinition } from '../../../../../../packages/shared/src'
import { FieldHint, LabeledField, TextField } from '../form-fields'
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
  const providerDefinition = getProviderDefinition(provider)
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
      <section
        className="settings-section settings-section-subtle settings-form"
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
          <p>Save or clear the secure key for this provider.</p>
        </div>

        <div className="settings-field-grid settings-field-grid-compact">
          <div className="settings-field">
            <LabeledField label="API Key">
              <FieldHint>
                {providerDefinition.requiresApiKey
                  ? 'Encrypted with OS-backed secure storage and excluded from portable backups.'
                  : 'Optional for local OpenAI-compatible servers that enforce bearer-token authentication.'}
              </FieldHint>
              <form.Field
                name="apiKey"
                validators={{
                  onChange: ({ value }) => (value.trim() ? undefined : 'API key is required.'),
                }}
                children={(field) => (
                  <TextField
                    field={field}
                    name="api-key"
                    placeholder="Paste API key"
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
      </section>

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
