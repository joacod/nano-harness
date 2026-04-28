import { useState } from 'react'

import type { AppSettings, ProviderStatus } from '../../../../../packages/shared/src'
import { ApiKeySettingsForm } from './settings/ApiKeySettingsForm'
import { DataBackupPanel } from './settings/DataBackupPanel'
import { ProviderSettingsForm } from './settings/ProviderSettingsForm'
import { ProviderStatusPanel } from './settings/ProviderStatusPanel'
import { Card, FeedbackText } from './ui'

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
  const [selectedProvider, setSelectedProvider] = useState(initialSettings.provider.provider)

  return (
    <Card className="settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Provider configuration</h2>
        <FeedbackText>
          Choose a provider and model. API keys are stored separately using this device's secure storage.
        </FeedbackText>

      {providerStatus ? <ProviderStatusPanel providerStatus={providerStatus} /> : null}

      <ProviderSettingsForm
        initialSettings={initialSettings}
        isSaving={isSaving}
        saveError={saveError}
        onProviderChange={setSelectedProvider}
        onSubmit={onSubmit}
      />

      <ApiKeySettingsForm
        apiKeyError={apiKeyError}
        isClearingApiKey={isClearingApiKey}
        isSavingApiKey={isSavingApiKey}
        provider={selectedProvider}
        providerStatus={providerStatus}
        onClearApiKey={onClearApiKey}
        onSaveApiKey={onSaveApiKey}
      />

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
