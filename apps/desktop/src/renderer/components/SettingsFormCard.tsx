import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getProviderDefinition, type AppSettings, type McpInventory, type MemoryProposalList, type MemoryRecordList, type ProviderAuthMethod, type ProviderStatus, type SkillInventory } from '../../../../../packages/shared/src'
import { providerCredentialStatusQueryOptions } from '../queries'
import { ApiKeySettingsForm } from './settings/ApiKeySettingsForm'
import { DataBackupPanel } from './settings/DataBackupPanel'
import { HarnessEngineeringCard } from './settings/HarnessEngineeringCard'
import { OAuthSettingsForm } from './settings/OAuthSettingsForm'
import { McpInspectorCard } from './settings/McpInspectorCard'
import { MemoryInspectorCard } from './settings/MemoryInspectorCard'
import { ProviderSettingsForm } from './settings/ProviderSettingsForm'
import { ProviderStatusPanel } from './settings/ProviderStatusPanel'
import { SkillsHubCard } from './settings/SkillsHubCard'
import { WorkspaceSettingsForm } from './settings/WorkspaceSettingsForm'
import { Card, Tabs } from './ui'

type SettingsTab = 'providers' | 'workspace' | 'skills' | 'mcp' | 'memory' | 'harness' | 'data'

export function SettingsFormCard({
  initialSettings,
  dataPath,
  providerStatus,
  skillInventory,
  mcpInventory,
  memoryRecords,
  memoryProposals,
  isSaving,
  isSavingApiKey,
  isStartingOauth,
  isClearingApiKey,
  isClearingOauth,
  isExportingData,
  isImportingData,
  isSavingSkills,
  isResolvingMemoryProposal,
  saveError,
  apiKeyError,
  oauthError,
  exportDataResult,
  importDataResult,
  dataError,
  skillsError,
  memoryError,
  onSubmit,
  onSaveApiKey,
  onClearApiKey,
  onStartOauth,
  onClearOauth,
  onExportData,
  onImportData,
  onToggleSkill,
  onResolveMemoryProposal,
}: {
  initialSettings: AppSettings
  dataPath: string | null
  providerStatus: ProviderStatus | null
  skillInventory: SkillInventory | null
  mcpInventory: McpInventory | null
  memoryRecords: MemoryRecordList | null
  memoryProposals: MemoryProposalList | null
  isSaving: boolean
  isSavingApiKey: boolean
  isStartingOauth: boolean
  isClearingApiKey: boolean
  isClearingOauth: boolean
  isExportingData: boolean
  isImportingData: boolean
  isSavingSkills: boolean
  isResolvingMemoryProposal: boolean
  saveError: string | null
  apiKeyError: string | null
  oauthError: string | null
  exportDataResult: string | null
  importDataResult: string | null
  dataError: string | null
  skillsError: string | null
  memoryError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
  onSaveApiKey: (input: { provider: AppSettings['provider']['provider']; apiKey: string }) => Promise<void>
  onClearApiKey: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onStartOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<{ accountId?: string }>
  onClearOauth: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onExportData: () => Promise<void>
  onImportData: () => Promise<void>
  onToggleSkill: (input: { skillId: string; enabled: boolean }) => Promise<void>
  onResolveMemoryProposal: (input: { proposalId: string; decision: 'approved' | 'rejected' }) => Promise<void>
}) {
  const [selectedProvider, setSelectedProvider] = useState(initialSettings.provider.provider)
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')
  const selectedProviderDefinition = getProviderDefinition(selectedProvider)
  const selectedCredentialStatusQuery = useQuery(providerCredentialStatusQueryOptions(selectedProvider))
  const selectedCredentialStatus = selectedCredentialStatusQuery.data ?? null
  const authMethods = selectedProviderDefinition.authMethods as readonly ProviderAuthMethod[]
  const authSection = authMethods.includes('api-key') ? (
    <ApiKeySettingsForm
      apiKeyError={apiKeyError}
      isClearingApiKey={isClearingApiKey}
      isSavingApiKey={isSavingApiKey}
      provider={selectedProvider}
      providerStatus={providerStatus}
      credentialStatus={selectedCredentialStatus}
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
      credentialStatus={selectedCredentialStatus}
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
            value: 'skills',
            label: 'Skills',
            panel: (
              <SkillsHubCard
                inventory={skillInventory}
                isSaving={isSavingSkills}
                error={skillsError}
                onToggleSkill={onToggleSkill}
              />
            ),
          },
          {
            value: 'mcp',
            label: 'MCP',
            panel: <McpInspectorCard inventory={mcpInventory} />,
          },
          {
            value: 'memory',
            label: 'Memory',
            panel: (
              <MemoryInspectorCard
                records={memoryRecords}
                proposals={memoryProposals}
                isResolving={isResolvingMemoryProposal}
                error={memoryError}
                onResolveProposal={onResolveMemoryProposal}
              />
            ),
          },
          {
            value: 'harness',
            label: 'Harness',
            panel: <HarnessEngineeringCard />,
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
