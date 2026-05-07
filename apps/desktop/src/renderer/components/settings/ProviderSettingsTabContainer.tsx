import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getProviderDefinition, type AppSettings, type ProviderAuthMethod } from '../../../../../../packages/shared/src'
import { providerCredentialStatusQueryOptions, providerStatusQueryOptions, settingsQueryOptions } from '../../queries'
import { ApiKeySettingsForm } from './ApiKeySettingsForm'
import { OAuthSettingsForm } from './OAuthSettingsForm'
import { ProviderSettingsForm } from './ProviderSettingsForm'
import { ProviderStatusPanel } from './ProviderStatusPanel'

export function ProviderSettingsTabContainer({ settings }: { settings: AppSettings }) {
  const [selectedProvider, setSelectedProvider] = useState(settings.provider.provider)
  const queryClient = useQueryClient()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const selectedCredentialStatusQuery = useQuery(providerCredentialStatusQueryOptions(selectedProvider))
  const selectedProviderDefinition = getProviderDefinition(selectedProvider)
  const providerStatus = providerStatusQuery.data ?? null
  const selectedCredentialStatus = selectedCredentialStatusQuery.data ?? null
  const authMethods = selectedProviderDefinition.authMethods as readonly ProviderAuthMethod[]
  const saveSettingsMutation = useMutation({
    mutationFn: async (nextSettings: AppSettings) => window.desktop.saveSettings(nextSettings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: providerStatusQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const saveApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider']; apiKey: string }) =>
      window.desktop.saveProviderAuth({ ...input, authMethod: 'api-key' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerStatusQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const clearApiKeyMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.clearProviderAuth({ ...input, authMethod: 'api-key' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerStatusQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const startOauthMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.startProviderOauth({ ...input, authMethod: 'oauth' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerStatusQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const clearOauthMutation = useMutation({
    mutationFn: async (input: { provider: AppSettings['provider']['provider'] }) =>
      window.desktop.clearProviderAuth({ ...input, authMethod: 'oauth' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providerStatusQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: ['provider-credential-status'] })
    },
  })
  const authSection = authMethods.includes('api-key') ? (
    <ApiKeySettingsForm
      apiKeyError={saveApiKeyMutation.error instanceof Error ? saveApiKeyMutation.error.message : clearApiKeyMutation.error instanceof Error ? clearApiKeyMutation.error.message : null}
      isClearingApiKey={clearApiKeyMutation.isPending}
      isSavingApiKey={saveApiKeyMutation.isPending}
      provider={selectedProvider}
      providerStatus={providerStatus}
      credentialStatus={selectedCredentialStatus}
      onClearApiKey={async (input) => {
        await clearApiKeyMutation.mutateAsync(input)
      }}
      onSaveApiKey={async (input) => {
        await saveApiKeyMutation.mutateAsync(input)
      }}
    />
  ) : authMethods.includes('oauth') ? (
    <OAuthSettingsForm
      authError={startOauthMutation.error instanceof Error ? startOauthMutation.error.message : clearOauthMutation.error instanceof Error ? clearOauthMutation.error.message : null}
      isClearingAuth={clearOauthMutation.isPending}
      isStartingOauth={startOauthMutation.isPending}
      provider={selectedProvider}
      providerStatus={providerStatus}
      credentialStatus={selectedCredentialStatus}
      onClearOauth={async (input) => {
        await clearOauthMutation.mutateAsync(input)
      }}
      onStartOauth={async (input) => await startOauthMutation.mutateAsync(input)}
    />
  ) : null

  return (
    <div className="settings-tab-stack">
      {providerStatus ? <ProviderStatusPanel providerStatus={providerStatus} /> : null}
      <ProviderSettingsForm
        initialSettings={settings}
        isSaving={saveSettingsMutation.isPending}
        saveError={saveSettingsMutation.error instanceof Error ? saveSettingsMutation.error.message : null}
        authSection={authSection}
        onProviderChange={setSelectedProvider}
        onSubmit={async (nextSettings) => {
          await saveSettingsMutation.mutateAsync(nextSettings)
        }}
      />
    </div>
  )
}
