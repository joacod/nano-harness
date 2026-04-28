import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings, ProviderStatus } from '../../../../../../packages/shared/src'
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
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setApiKeyMessage(null)
          void form.handleSubmit()
        }}
      >
        <LabeledField label="API Key">
          <FieldHint>API keys are encrypted with OS-backed secure storage and are not included in portable backups.</FieldHint>
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

        <div className="form-row">
          <Button type="submit" variant="primary" disabled={isSavingApiKey}>
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
      </form>

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
