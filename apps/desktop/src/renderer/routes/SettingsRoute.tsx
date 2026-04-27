import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AppSettings } from '../../../../../packages/shared/src'
import { SettingsFormCard } from '../components/SettingsFormCard'
import { contextQueryOptions, providerStatusQueryOptions, settingsQueryOptions } from '../queries'

export function SettingsRoute() {
  const queryClient = useQueryClient()
  const contextQuery = useQuery(contextQueryOptions)
  const settingsQuery = useQuery(settingsQueryOptions)
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const mutation = useMutation({
    mutationFn: async (settings: AppSettings) => window.desktop.saveSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
    },
  })
  const saveApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider']; apiKey: string }) =>
      window.desktop.saveProviderApiKey(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
    },
  })
  const clearApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) => window.desktop.clearProviderApiKey(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['provider-status'] })
    },
  })
  const exportDataMutation = useMutation({
    mutationFn: async () => window.desktop.exportData(),
  })
  const importDataMutation = useMutation({
    mutationFn: async () => window.desktop.importData(),
  })

  if (!settingsQuery.data) {
    return (
      <section className="panel-card panel-card-hero">
        <p className="eyebrow">Settings</p>
        <h2>Loading provider settings...</h2>
      </section>
    )
  }

  return (
    <SettingsFormCard
      key={JSON.stringify(settingsQuery.data)}
      initialSettings={settingsQuery.data}
      dataPath={contextQuery.data?.dataPath ?? null}
      providerStatus={providerStatusQuery.data ?? null}
      isSaving={mutation.isPending}
      isSavingApiKey={saveApiKeyMutation.isPending}
      isClearingApiKey={clearApiKeyMutation.isPending}
      isExportingData={exportDataMutation.isPending}
      isImportingData={importDataMutation.isPending}
      saveError={mutation.error instanceof Error ? mutation.error.message : null}
      apiKeyError={saveApiKeyMutation.error instanceof Error ? saveApiKeyMutation.error.message : clearApiKeyMutation.error instanceof Error ? clearApiKeyMutation.error.message : null}
      exportDataResult={exportDataMutation.data?.exportedFilePath ?? null}
      importDataResult={importDataMutation.data?.backupFilePath ?? null}
      dataError={exportDataMutation.error instanceof Error ? exportDataMutation.error.message : importDataMutation.error instanceof Error ? importDataMutation.error.message : null}
      onSubmit={async (settings) => {
        await mutation.mutateAsync(settings)
      }}
      onSaveApiKey={async (input) => {
        await saveApiKeyMutation.mutateAsync(input)
      }}
      onClearApiKey={async (input) => {
        await clearApiKeyMutation.mutateAsync(input)
      }}
      onExportData={async () => {
        await exportDataMutation.mutateAsync()
      }}
      onImportData={async () => {
        await importDataMutation.mutateAsync()
      }}
    />
  )
}
