import { useState } from 'react'

import { getProviderDefinition, type AppSettings, type ProviderAuthMethod, type ProviderStatus } from '../../../../../packages/shared/src'
import { ApiKeySettingsForm } from './settings/ApiKeySettingsForm'
import { DataBackupPanel } from './settings/DataBackupPanel'
import { OAuthSettingsForm } from './settings/OAuthSettingsForm'
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
  isStartingOauth,
  isClearingApiKey,
  isClearingOauth,
  isExportingData,
  isImportingData,
  saveError,
  apiKeyError,
  oauthError,
  exportDataResult,
  importDataResult,
  dataError,
  onSubmit,
  onSaveApiKey,
  onClearApiKey,
  onStartOauth,
  onClearOauth,
  onExportData,
  onImportData,
}: {
  initialSettings: AppSettings
  dataPath: string | null
  providerStatus: ProviderStatus | null
  isSaving: boolean
  isSavingApiKey: boolean
  isStartingOauth: boolean
  isClearingApiKey: boolean
  isClearingOauth: boolean
  isExportingData: boolean
  isImportingData: boolean
  saveError: string | null
  apiKeyError: string | null
  oauthError: string | null
  exportDataResult: string | null
  importDataResult: string | null
  dataError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
  onSaveApiKey: (input: { provider: AppSettings['provider']['provider']; apiKey: string }) => Promise<void>
  onClearApiKey: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onStartOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<{ accountId?: string }>
  onClearOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onExportData: () => Promise<void>
  onImportData: () => Promise<void>
}) {
  const [selectedProvider, setSelectedProvider] = useState(initialSettings.provider.provider)
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')
  const selectedProviderDefinition = getProviderDefinition(selectedProvider)
  const authMethods = selectedProviderDefinition.authMethods as readonly ProviderAuthMethod[]
  const authSection = authMethods.includes('api-key') ? (
    <ApiKeySettingsForm
      apiKeyError={apiKeyError}
      isClearingApiKey={isClearingApiKey}
      isSavingApiKey={isSavingApiKey}
      provider={selectedProvider}
      providerStatus={providerStatus}
      onClearApiKey={onClearApiKey}
      onSaveApiKey={onSaveApiKey}
    />
  ) : authMethods.includes('oauth') ? (
    <OAuthSettingsForm
      authError={oauthError}
      isClearingAuth={isClearingOauth}
      isStartingOauth={isStartingOauth}
      provider={selectedProvider}
      providerStatus={providerStatus}
      onClearOauth={onClearOauth}
      onStartOauth={onStartOauth}
    />
  ) : null

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
                  authSection={authSection}
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
