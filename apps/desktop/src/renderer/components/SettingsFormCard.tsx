import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings, ProviderStatus } from '../../../../../packages/shared/src'
import { providerOptions } from '../../../../../packages/shared/src'
import { applyProviderDefaults } from '../utils/run-events'
import { FieldHint, LabeledField, TextField } from './form-fields'
import { DataBackupPanel } from './settings/DataBackupPanel'
import { ProviderStatusPanel } from './settings/ProviderStatusPanel'
import { Button, Card, FeedbackText, Select } from './ui'

export function SettingsFormCard({
  initialSettings,
  dataPath,
  providerStatus,
  isSaving,
  isSavingApiKey,
  isClearingApiKey,
  isExportingData,
  isImportingData,
  saveError,
  apiKeyError,
  exportDataResult,
  importDataResult,
  dataError,
  onSubmit,
  onSaveApiKey,
  onClearApiKey,
  onExportData,
  onImportData,
}: {
  initialSettings: AppSettings
  dataPath: string | null
  providerStatus: ProviderStatus | null
  isSaving: boolean
  isSavingApiKey: boolean
  isClearingApiKey: boolean
  isExportingData: boolean
  isImportingData: boolean
  saveError: string | null
  apiKeyError: string | null
  exportDataResult: string | null
  importDataResult: string | null
  dataError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
  onSaveApiKey: (input: { provider: AppSettings['provider']['provider']; apiKey: string }) => Promise<void>
  onClearApiKey: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onExportData: () => Promise<void>
  onImportData: () => Promise<void>
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null)

  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      const normalizedSettings: AppSettings = {
        provider: {
          provider: value.provider.provider,
          model: value.provider.model.trim(),
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
  const apiKeyForm = useForm({
    defaultValues: {
      apiKey: '',
    },
    onSubmit: async ({ value }) => {
      const apiKey = value.apiKey.trim()

      if (!apiKey) {
        setApiKeyMessage(null)
        return
      }

      await onSaveApiKey({ provider: form.getFieldValue('provider.provider'), apiKey })
      apiKeyForm.reset()
      setApiKeyMessage('API key saved securely on this device.')
    },
  })

  return (
    <Card className="settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Provider configuration</h2>
        <FeedbackText>
          Choose a provider and model. API keys are stored separately using this device's secure storage.
        </FeedbackText>

      {providerStatus ? <ProviderStatusPanel providerStatus={providerStatus} /> : null}

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setSaveMessage(null)
          void form.handleSubmit()
        }}
      >
        <LabeledField label="Provider">
          <FieldHint>Select the hosted provider you want to use.</FieldHint>
          <form.Field
            name="provider.provider"
            children={(field) => (
              <Select
                name="provider"
                value={field.state.value}
                onChange={(event) => {
                  const nextProvider = event.target.value as AppSettings['provider']['provider']
                  field.handleChange(nextProvider)
                  const nextSettings = applyProviderDefaults(form.state.values, nextProvider)
                  form.setFieldValue('provider.model', nextSettings.provider.model)
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
          <div className="preset-row">
            <Button
              type="button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
              }}
            >
              Use defaults
            </Button>
          </div>
        </LabeledField>

        <LabeledField label="Model">
          <FieldHint>
            Choose a model available for your selected provider.
          </FieldHint>
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

        <LabeledField label="Reasoning">
          <FieldHint>Show provider-supplied model thinking when the selected provider and model expose it. Effort modes may increase cost and latency.</FieldHint>
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

        <LabeledField label="Workspace Root">
          <FieldHint>Built-in file actions are restricted to this directory tree.</FieldHint>
          <form.Field
            name="workspace.rootPath"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Workspace root is required.'),
            }}
            children={(field) => (
              <TextField field={field} name="workspace-root" placeholder="Example: /Users/name/project" autoComplete="off" spellCheck={false} />
            )}
          />
        </LabeledField>

        <LabeledField label="Approval Policy">
          <form.Field
            name="workspace.approvalPolicy"
            children={(field) => (
              <Select
                name="approval-policy"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as AppSettings['workspace']['approvalPolicy'])}
              >
                <option value="on-request">on-request</option>
                <option value="always">always</option>
                <option value="never">never</option>
              </Select>
            )}
          />
        </LabeledField>

        <div className="form-row">
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

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setApiKeyMessage(null)
          void apiKeyForm.handleSubmit()
        }}
      >
        <LabeledField label="API Key">
          <FieldHint>
            API keys are encrypted with OS-backed secure storage and are not included in portable backups.
          </FieldHint>
          <apiKeyForm.Field
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
              void onClearApiKey({ provider: form.getFieldValue('provider.provider') }).then(() => {
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

      <DataBackupPanel
        dataPath={dataPath}
        dataError={dataError}
        exportDataResult={exportDataResult}
        importDataResult={importDataResult}
        isExportingData={isExportingData}
        isImportingData={isImportingData}
        onExportData={onExportData}
        onImportData={onImportData}
      />
    </Card>
  )
}
