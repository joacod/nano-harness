import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { SettingsFormCard, type SettingsTab } from '../components/SettingsFormCard'
import { AdvancedSettingsTabContainer } from '../components/settings/AdvancedSettingsTabContainer'
import { DataSettingsTabContainer } from '../components/settings/DataSettingsTabContainer'
import { HarnessEngineeringCard } from '../components/settings/HarnessEngineeringCard'
import { MemorySettingsTabContainer } from '../components/settings/MemorySettingsTabContainer'
import { McpSettingsTabContainer } from '../components/settings/McpSettingsTabContainer'
import { ProviderSettingsTabContainer } from '../components/settings/ProviderSettingsTabContainer'
import { SkillsSettingsTabContainer } from '../components/settings/SkillsSettingsTabContainer'
import { WorkspaceSettingsTabContainer } from '../components/settings/WorkspaceSettingsTabContainer'
import { Card } from '../components/ui'
import { settingsQueryOptions } from '../queries'

export function SettingsRoute() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')
  const settingsQuery = useQuery(settingsQueryOptions)

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
      providersPanel={<ProviderSettingsTabContainer settings={settingsQuery.data} />}
      workspacePanel={<WorkspaceSettingsTabContainer settings={settingsQuery.data} />}
      advancedPanel={<AdvancedSettingsTabContainer settings={settingsQuery.data} />}
      skillsPanel={<SkillsSettingsTabContainer settings={settingsQuery.data} />}
      mcpPanel={<McpSettingsTabContainer />}
      memoryPanel={<MemorySettingsTabContainer />}
      harnessPanel={<HarnessEngineeringCard />}
      dataPanel={<DataSettingsTabContainer />}
      selectedTab={selectedTab}
      onSelectedTabChange={setSelectedTab}
    />
  )
}
