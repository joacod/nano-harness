import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AppSettings } from '../../../../../packages/shared/src'
import { SettingsFormCard, type SettingsTab } from '../components/SettingsFormCard'
import { SkillsSettingsTabContainer } from '../components/settings/SkillsSettingsTabContainer'
import { Card } from '../components/ui'
import { contextQueryOptions, mcpInventoryQueryOptions, memoryProposalsQueryOptions, memoryRecordsQueryOptions, providerStatusQueryOptions, settingsQueryOptions } from '../queries'

export function SettingsRoute() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')
  const queryClient = useQueryClient()
  const contextQuery = useQuery(contextQueryOptions)
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const mcpInventoryQuery = useQuery(mcpInventoryQueryOptions)
  const memoryRecordsQuery = useQuery(memoryRecordsQueryOptions)
  const memoryProposalsQuery = useQuery(memoryProposalsQueryOptions)
  const mutation = useMutation({
    mutationFn: async (settings: AppSettings) => window.desktop.saveSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const saveApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider']; apiKey: string }) =>
      window.desktop.saveProviderAuth({ ...input, authMethod: 'api-key' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const clearApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.clearProviderAuth({ ...input, authMethod: 'api-key' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const startOauthMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.startProviderOauth({ ...input, authMethod: 'oauth' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const clearOauthMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.clearProviderAuth({ ...input, authMethod: 'oauth' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const exportDataMutation = useMutation({
    mutationFn: async () => window.desktop.exportData(),
  })
  const importDataMutation = useMutation({
    mutationFn: async () => window.desktop.importData(),
  })
  const resolveMemoryProposalMutation = useMutation({
    mutationFn: async (input: { proposalId: string; decision: 'approved' | 'rejected' }) => window.desktop.resolveMemoryProposal(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memory-records'] })
      await queryClient.invalidateQueries({ queryKey: ['memory-proposals'] })
    },
  })

  if (!settingsQuery.data) {
    return (
      <Card hero>
        <p className="eyebrow">Settings</p>
        <h2>Loading provider settings…</h2>
      </Card>
    )
  }

  return (
    <SettingsFormCard
        key={JSON.stringify(settingsQuery.data)}
        initialSettings={settingsQuery.data}
        dataPath={contextQuery.data?.dataPath ?? null}
        providerStatus={providerStatusQuery.data ?? null}
        skillsPanel={<SkillsSettingsTabContainer settings={settingsQuery.data} />}
        mcpInventory={mcpInventoryQuery.data ?? null}
        memoryRecords={memoryRecordsQuery.data ?? null}
        memoryProposals={memoryProposalsQuery.data ?? null}
        selectedTab={selectedTab}
        isSaving={mutation.isPending}
        isSavingApiKey={saveApiKeyMutation.isPending}
        isStartingOauth={startOauthMutation.isPending}
        isClearingApiKey={clearApiKeyMutation.isPending}
        isClearingOauth={clearOauthMutation.isPending}
        isExportingData={exportDataMutation.isPending}
        isImportingData={importDataMutation.isPending}
        isResolvingMemoryProposal={resolveMemoryProposalMutation.isPending}
        saveError={mutation.error instanceof Error ? mutation.error.message : null}
        apiKeyError={saveApiKeyMutation.error instanceof Error ? saveApiKeyMutation.error.message : clearApiKeyMutation.error instanceof Error ? clearApiKeyMutation.error.message : null}
        oauthError={startOauthMutation.error instanceof Error ? startOauthMutation.error.message : clearOauthMutation.error instanceof Error ? clearOauthMutation.error.message : null}
        exportDataResult={exportDataMutation.data?.exportedFilePath ?? null}
        importDataResult={importDataMutation.data?.backupFilePath ?? null}
        dataError={exportDataMutation.error instanceof Error ? exportDataMutation.error.message : importDataMutation.error instanceof Error ? importDataMutation.error.message : null}
        memoryError={resolveMemoryProposalMutation.error instanceof Error ? resolveMemoryProposalMutation.error.message : null}
        onSubmit={async (settings) => {
          await mutation.mutateAsync(settings)
        }}
        onSaveApiKey={async (input) => {
          await saveApiKeyMutation.mutateAsync(input)
        }}
        onClearApiKey={async (input) => {
          await clearApiKeyMutation.mutateAsync(input)
        }}
        onStartOauth={async (input) => {
          return await startOauthMutation.mutateAsync(input)
        }}
        onClearOauth={async (input) => {
          await clearOauthMutation.mutateAsync(input)
        }}
        onExportData={async () => {
          await exportDataMutation.mutateAsync()
        }}
        onImportData={async () => {
          await importDataMutation.mutateAsync()
        }}
        onSelectedTabChange={setSelectedTab}
        onResolveMemoryProposal={async (input) => {
          await resolveMemoryProposalMutation.mutateAsync(input)
        }}
      />
  )
}
