import { type ReactNode, useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { getProviderDefinition, providerOptions } from '../../../../../../packages/shared/src'
import { applyProviderDefaults } from '../../utils/run-events'
import { FieldHint, LabeledField, TextField } from '../form-fields'
import { Button, FeedbackText, Select } from '../ui'

export function ProviderSettingsForm({
  initialSettings,
  isSaving,
  saveError,
  apiKeySection,
  onProviderChange,
  onSubmit,
}: {
  initialSettings: AppSettings
  isSaving: boolean
  saveError: string | null
  apiKeySection?: ReactNode
  onProviderChange: (provider: AppSettings['provider']['provider']) => void
  onSubmit: (settings: AppSettings) => Promise<void>
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      const normalizedSettings: AppSettings = {
        provider: {
          provider: value.provider.provider,
          model: value.provider.model.trim(),
          baseUrl: value.provider.baseUrl?.trim() || getProviderDefinition(value.provider.provider).baseUrl,
          reasoning: value.provider.reasoning,
        },
        workspace: {
          ...value.workspace,
          rootPath: value.workspace.rootPath.trim(),
        },
      }

      await onSubmit(normalizedSettings)
      setSaveMessage('Settings saved.')
    },
  })

  return (
    <>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setSaveMessage(null)
          void form.handleSubmit()
        }}
      >
        <section className="settings-section" aria-labelledby="provider-account-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="provider-account-heading">
              Provider
            </p>
          </div>

          <div className="settings-field-grid settings-field-grid-compact">
            <div className="settings-field">
              <LabeledField label="Provider">
                <form.Field
                  name="provider.provider"
                  children={(field) => (
                    <Select
                      name="provider"
                      value={field.state.value}
                      onChange={(event) => {
                        const nextProvider = event.target.value as AppSettings['provider']['provider']
                        field.handleChange(nextProvider)
                        onProviderChange(nextProvider)
                        const nextSettings = applyProviderDefaults(form.state.values, nextProvider)
                        form.setFieldValue('provider.model', nextSettings.provider.model)
                        form.setFieldValue('provider.baseUrl', nextSettings.provider.baseUrl)
                      }}
                    >
                      {providerOptions.map((provider) => (
                        <option key={provider.key} value={provider.key}>
                          {provider.label}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </LabeledField>
            </div>
          </div>
        </section>

        {apiKeySection}

        <section className="settings-section" aria-labelledby="provider-endpoint-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="provider-endpoint-heading">
              Endpoint
            </p>
            <p>Model and API endpoint.</p>
          </div>

          <div className="form-row action-row-left">
            <Button
              type="button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
                form.setFieldValue('provider.baseUrl', nextSettings.provider.baseUrl)
              }}
            >
              Use defaults
            </Button>
          </div>

          <div className="settings-field-grid">
            <div className="settings-field">
              <LabeledField label="Model">
                <FieldHint>Model ID to use for runs.</FieldHint>
                <form.Field
                  name="provider.model"
                  validators={{
                    onChange: ({ value }) => (value.trim() ? undefined : 'Model is required.'),
                  }}
                  children={(field) => (
                    <TextField
                      field={field}
                      name="model"
                      placeholder="Example: x-ai/grok-4.1-fast"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                />
              </LabeledField>
            </div>

            <div className="settings-field">
              <LabeledField label="Base URL">
                <FieldHint>OpenAI-compatible API root.</FieldHint>
                <form.Field
                  name="provider.baseUrl"
                  validators={{
                    onChange: ({ value }) => (value?.trim() ? undefined : 'Base URL is required.'),
                  }}
                  children={(field) => (
                    <TextField
                      field={field}
                      name="provider-base-url"
                      placeholder="Example: http://127.0.0.1:8080/v1"
                      autoComplete="url"
                      spellCheck={false}
                    />
                  )}
                />
              </LabeledField>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="provider-generation-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="provider-generation-heading">
              Generation
            </p>
          </div>

          <div className="settings-field-grid settings-field-grid-compact">
            <div className="settings-field">
              <LabeledField label="Reasoning">
                <FieldHint>Model thinking, when supported.</FieldHint>
                <form.Field
                  name="provider.reasoning"
                  children={(field) => {
                    const value = field.state.value?.mode === 'effort' ? field.state.value.effort : field.state.value?.mode ?? 'auto'

                    return (
                      <Select
                        name="provider-reasoning"
                        value={value}
                        onChange={(event) => {
                          const nextValue = event.target.value

                          if (nextValue === 'auto' || nextValue === 'off') {
                            field.handleChange({ mode: nextValue })
                            return
                          }

                          field.handleChange({ mode: 'effort', effort: nextValue as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' })
                        }}
                      >
                        <option value="auto">auto</option>
                        <option value="off">off</option>
                        <option value="minimal">minimal effort</option>
                        <option value="low">low effort</option>
                        <option value="medium">medium effort</option>
                        <option value="high">high effort</option>
                        <option value="xhigh">xhigh effort</option>
                      </Select>
                    )
                  }}
                />
              </LabeledField>
            </div>
          </div>
        </section>

        <div className="form-row action-row-left settings-save-row">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>

      {saveMessage ? (
        <FeedbackText variant="success" live>
          {saveMessage}
        </FeedbackText>
      ) : null}
      {saveError ? (
        <FeedbackText variant="error" live>
          {saveError}
        </FeedbackText>
      ) : null}
    </>
  )
}
