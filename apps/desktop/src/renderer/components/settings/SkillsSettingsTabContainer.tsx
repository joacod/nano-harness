import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { settingsQueryOptions, skillsQueryOptions } from '../../queries'
import { SkillsHubCard } from './SkillsHubCard'

export function SkillsSettingsTabContainer({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const skillsQuery = useQuery(skillsQueryOptions)
  const toggleSkillMutation = useMutation({
    mutationFn: async (input: { skillId: string; enabled: boolean }) => {
      const disabledSkillIds = new Set(settings.skills?.disabledSkillIds ?? [])

      if (input.enabled) {
        disabledSkillIds.delete(input.skillId)
      } else {
        disabledSkillIds.add(input.skillId)
      }

      return await window.desktop.saveSettings({
        ...settings,
        skills: {
          disabledSkillIds: [...disabledSkillIds].sort((left, right) => left.localeCompare(right)),
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: skillsQueryOptions.queryKey })
    },
  })

  return (
    <SkillsHubCard
      inventory={skillsQuery.data ?? null}
      isSaving={toggleSkillMutation.isPending}
      error={toggleSkillMutation.error instanceof Error ? toggleSkillMutation.error.message : null}
      onToggleSkill={async (input) => {
        await toggleSkillMutation.mutateAsync(input)
      }}
    />
  )
}
