import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings, ProviderStatus } from '../../../../../packages/shared/src'
import { providerOptions } from '../../../../../packages/shared/src'
import { applyProviderDefaults } from '../utils/run-events'
import { FieldHint, LabeledField, TextField } from './form-fields'

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
    <section className="panel-card settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Provider configuration</h2>
      <p className="muted-copy">
        Choose a provider and model. API keys are stored separately using this device's secure storage.
      </p>

      {providerStatus ? (
        <section className="provider-status-card">
          <div className="sidebar-header-row">
            <div>
              <p className="eyebrow">Provider status</p>
              <h3>{providerStatus.providerLabel}</h3>
            </div>
            <span className={`status-badge ${providerStatus.isReady ? 'status-completed' : 'status-waiting_approval'}`}>
              {providerStatus.isReady ? 'ready' : 'check setup'}
            </span>
          </div>
          <dl className="summary-list">
            <div>
              <dt>Model</dt>
              <dd>{providerStatus.model}</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>
                {providerStatus.apiKeyLabel} {providerStatus.apiKeyPresent ? '(configured)' : '(missing)'}
              </dd>
            </div>
          </dl>
          {providerStatus.issues.map((issue) => (
            <p key={issue} className="error-copy">
              {issue}
            </p>
          ))}
          {providerStatus.hints.map((hint) => (
            <p key={hint} className="muted-copy">
              {hint}
            </p>
          ))}
        </section>
      ) : null}

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
              <select
                className="text-input"
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
              </select>
            )}
          />
          <div className="preset-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
              }}
            >
              Use defaults
            </button>
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
            children={(field) => <TextField field={field} placeholder="x-ai/grok-4.1-fast" />}
          />
        </LabeledField>

        <LabeledField label="Workspace Root">
          <FieldHint>Built-in file actions are restricted to this directory tree.</FieldHint>
          <form.Field
            name="workspace.rootPath"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Workspace root is required.'),
            }}
            children={(field) => <TextField field={field} placeholder="/Users/name/project" />}
          />
        </LabeledField>

        <LabeledField label="Approval Policy">
          <form.Field
            name="workspace.approvalPolicy"
            children={(field) => (
              <select
                className="text-input"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as AppSettings['workspace']['approvalPolicy'])}
              >
                <option value="on-request">on-request</option>
                <option value="always">always</option>
                <option value="never">never</option>
              </select>
            )}
          />
        </LabeledField>

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>

      {saveMessage ? <p className="success-copy">{saveMessage}</p> : null}
      {saveError ? <p className="error-copy">{saveError}</p> : null}

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
            children={(field) => <TextField field={field} placeholder="Paste API key" inputType="password" />}
          />
        </LabeledField>

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={isSavingApiKey}>
            {isSavingApiKey ? 'Saving API key...' : 'Save API key'}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={isClearingApiKey || !providerStatus?.apiKeyPresent}
            onClick={() => {
              setApiKeyMessage(null)
              void onClearApiKey({ provider: form.getFieldValue('provider.provider') }).then(() => {
                setApiKeyMessage('API key cleared.')
              })
            }}
          >
            {isClearingApiKey ? 'Clearing...' : 'Clear API key'}
          </button>
        </div>
      </form>

      {apiKeyMessage ? <p className="success-copy">{apiKeyMessage}</p> : null}
      {apiKeyError ? <p className="error-copy">{apiKeyError}</p> : null}

      <section className="provider-status-card">
        <div className="sidebar-header-row">
          <div>
            <p className="eyebrow">Data</p>
            <h3>Backup and restore</h3>
          </div>
        </div>
        <dl className="summary-list">
          <div>
            <dt>Database</dt>
            <dd>{dataPath ?? 'Loading data location...'}</dd>
          </div>
        </dl>
        <p className="warning-copy">
          Export includes conversations, run history, approvals, and non-sensitive settings. API keys are not included and must be re-entered after import.
        </p>
        <p className="warning-copy">
          Import replaces your current Nano Harness data. A local safety backup is created first, and the app relaunches after import.
        </p>
        <div className="form-row">
          <button
            type="button"
            className="primary-button"
            disabled={isExportingData}
            onClick={() => {
              if (!window.confirm('Export Nano Harness data without API keys? Keep the backup file private.')) {
                return
              }

              void onExportData()
            }}
          >
            {isExportingData ? 'Exporting...' : 'Export data'}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={isImportingData}
            onClick={() => {
              if (!window.confirm('Import replaces current app data and does not restore API keys. Continue?')) {
                return
              }

              void onImportData()
            }}
          >
            {isImportingData ? 'Importing...' : 'Import data'}
          </button>
        </div>
        {exportDataResult ? <p className="success-copy">Exported to {exportDataResult}</p> : null}
        {importDataResult ? <p className="success-copy">Safety backup created at {importDataResult}</p> : null}
        {dataError ? <p className="error-copy">{dataError}</p> : null}
      </section>
    </section>
  )
}
