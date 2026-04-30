import { useState } from 'react'

import { getProviderDefinition, type AppSettings, type ProviderStatus } from '../../../../../packages/shared/src'
import { ApiKeySettingsForm } from './settings/ApiKeySettingsForm'
import { DataBackupPanel } from './settings/DataBackupPanel'
import { ProviderSettingsForm } from './settings/ProviderSettingsForm'
import { ProviderStatusPanel } from './settings/ProviderStatusPanel'
import { WorkspaceSettingsForm } from './settings/WorkspaceSettingsForm'
import { Card, Tabs } from './ui'

type SettingsTab = 'providers' | 'workspace' | 'data'

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
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')
  const selectedProviderDefinition = getProviderDefinition(selectedProvider)

  return (
    <Card className="settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Configuration</h2>

      <Tabs
        ariaLabel="Settings sections"
        value={selectedTab}
        onValueChange={setSelectedTab}
        tabs={[
          {
            value: 'providers',
            label: 'Providers',
            panel: (
              <div className="settings-tab-stack">
                {providerStatus ? <ProviderStatusPanel providerStatus={providerStatus} /> : null}

                <ProviderSettingsForm
                  initialSettings={initialSettings}
                  isSaving={isSaving}
                  saveError={saveError}
                  apiKeySection={
                    selectedProviderDefinition.requiresApiKey ? (
                      <ApiKeySettingsForm
                        apiKeyError={apiKeyError}
                        isClearingApiKey={isClearingApiKey}
                        isSavingApiKey={isSavingApiKey}
                        provider={selectedProvider}
                        providerStatus={providerStatus}
                        onClearApiKey={onClearApiKey}
                        onSaveApiKey={onSaveApiKey}
                      />
                    ) : null
                  }
                  onProviderChange={setSelectedProvider}
                  onSubmit={onSubmit}
                />
              </div>
            ),
          },
          {
            value: 'workspace',
            label: 'Workspace',
            panel: (
              <div className="settings-tab-stack">
                <WorkspaceSettingsForm initialSettings={initialSettings} isSaving={isSaving} saveError={saveError} onSubmit={onSubmit} />
              </div>
            ),
          },
          {
            value: 'data',
            label: 'Data',
            panel: (
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
            ),
          },
        ]}
      />
    </Card>
  )
}
