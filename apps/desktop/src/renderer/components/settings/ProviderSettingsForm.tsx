import { type ReactNode, useEffect, useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { getProviderDefinition, providerDefaultModels, providerOptions } from '../../../../../../packages/shared/src'
import { applyProviderDefaults } from '../../utils/run-events'
import { FieldHint, LabeledField, TextField } from '../form-fields'
import { Button, FeedbackText, Select } from '../ui'

export function ProviderSettingsForm({
  initialSettings,
  isSaving,
  saveError,
  authSection,
  onProviderChange,
  onSubmit,
}: {
  initialSettings: AppSettings
  isSaving: boolean
  saveError: string | null
  authSection?: ReactNode
  onProviderChange: (provider: AppSettings['provider']['provider']) => void
  onSubmit: (settings: AppSettings) => Promise<void>
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [savedSettings, setSavedSettings] = useState(() => normalizeProviderSettings(initialSettings))
  const [draftSettings, setDraftSettings] = useState(() => normalizeProviderSettings(initialSettings))
  const [selectedProvider, setSelectedProvider] = useState(initialSettings.provider.provider)
  const selectedProviderDefinition = getProviderDefinition(selectedProvider)
  const hasUnsavedChanges = serializeSettings(savedSettings) !== serializeSettings(normalizeProviderSettings(draftSettings))
  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      const providerDefinition = getProviderDefinition(value.provider.provider)
      const normalizedSettings: AppSettings = {
        provider: {
          provider: value.provider.provider,
          model: value.provider.model.trim(),
          baseUrl:
            !providerDefinition.endpoint.editable
              ? providerDefinition.baseUrl
              : value.provider.baseUrl?.trim() || providerDefinition.baseUrl,
          reasoning: value.provider.reasoning,
        },
        workspace: {
          ...value.workspace,
          rootPath: value.workspace.rootPath.trim(),
        },
      }

      await onSubmit(normalizedSettings)
      setSavedSettings(normalizedSettings)
      setDraftSettings(normalizedSettings)
      setSaveMessage('Settings saved.')
    },
  })

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

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
        <div className="settings-field-grid settings-provider-grid">
          <section className="settings-mini-section" aria-labelledby="provider-account-heading">
            <div className="settings-section-heading">
              <p className="eyebrow" id="provider-account-heading">
                Provider
              </p>
            </div>

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
                        setSelectedProvider(nextProvider)
                        onProviderChange(nextProvider)
                        const nextSettings = applyProviderDefaults({
                          ...form.state.values,
                          provider: {
                            ...form.state.values.provider,
                            provider: nextProvider,
                          },
                        }, nextProvider)
                        form.setFieldValue('provider.model', nextSettings.provider.model)
                        form.setFieldValue('provider.baseUrl', nextSettings.provider.baseUrl)
                        setDraftSettings(nextSettings)
                        setSaveMessage(null)
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
          </section>
          {authSection ? <div className="settings-field">{authSection}</div> : null}
        </div>

        <section className="settings-section" aria-labelledby="provider-endpoint-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="provider-endpoint-heading">
              Endpoint
            </p>
            <p>{selectedProviderDefinition.endpoint.description}</p>
          </div>

          <div className="form-row action-row-left">
            <Button
              type="button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
                form.setFieldValue('provider.baseUrl', nextSettings.provider.baseUrl)
                setDraftSettings(nextSettings)
                setSaveMessage(null)
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
                        placeholder={`Example: ${providerDefaultModels.openrouter}`}
                        autoComplete="off"
                        onValueChange={(value) => {
                          setDraftSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, model: value },
                          }))
                          setSaveMessage(null)
                        }}
                        spellCheck={false}
                      />
                  )}
                />
              </LabeledField>
            </div>

            <div className="settings-field">
              <LabeledField label="Base URL">
                <FieldHint>{selectedProviderDefinition.endpoint.hint}</FieldHint>
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
                        onValueChange={(value) => {
                          setDraftSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, baseUrl: value },
                          }))
                          setSaveMessage(null)
                        }}
                        readOnly={!selectedProviderDefinition.endpoint.editable}
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
                            setDraftSettings((current) => ({
                              ...current,
                              provider: { ...current.provider, reasoning: { mode: nextValue } },
                            }))
                            setSaveMessage(null)
                            return
                          }

                          const reasoning = { mode: 'effort' as const, effort: nextValue as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' }
                          field.handleChange(reasoning)
                          setDraftSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, reasoning },
                          }))
                          setSaveMessage(null)
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
          <Button type="submit" variant="primary" disabled={isSaving || !hasUnsavedChanges}>
            {isSaving ? 'Saving…' : hasUnsavedChanges ? 'Save settings' : 'Saved'}
          </Button>
          {hasUnsavedChanges ? <FeedbackText variant="warning">Unsaved provider changes. Save to make them active.</FeedbackText> : null}
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

function normalizeProviderSettings(settings: AppSettings): AppSettings {
  const providerDefinition = getProviderDefinition(settings.provider.provider)

  return {
    provider: {
      provider: settings.provider.provider,
      model: settings.provider.model.trim(),
      baseUrl:
        !providerDefinition.endpoint.editable
          ? providerDefinition.baseUrl
          : settings.provider.baseUrl?.trim() || providerDefinition.baseUrl,
      reasoning: settings.provider.reasoning,
    },
    workspace: {
      ...settings.workspace,
      rootPath: settings.workspace.rootPath.trim(),
    },
  }
}

function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings)
}
