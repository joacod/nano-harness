import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { settingsQueryOptions } from '../../queries'
import { WorkspaceSettingsForm } from './WorkspaceSettingsForm'

export function WorkspaceSettingsTabContainer({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const saveSettingsMutation = useMutation({
    mutationFn: async (nextSettings: AppSettings) => window.desktop.saveSettings(nextSettings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryOptions.queryKey })
    },
  })

  return (
    <div className="settings-tab-stack">
      <WorkspaceSettingsForm
        initialSettings={settings}
        isSaving={saveSettingsMutation.isPending}
        saveError={saveSettingsMutation.error instanceof Error ? saveSettingsMutation.error.message : null}
        onSubmit={async (nextSettings) => {
          await saveSettingsMutation.mutateAsync(nextSettings)
        }}
      />
    </div>
  )
}
