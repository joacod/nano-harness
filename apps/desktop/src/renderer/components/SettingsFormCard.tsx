import type { ReactNode } from 'react'

import { Card, Tabs } from './ui'

export type SettingsTab = 'providers' | 'workspace' | 'skills' | 'mcp' | 'memory' | 'harness' | 'data' | 'advanced'

export function SettingsFormCard({
  providersPanel,
  workspacePanel,
  advancedPanel,
  skillsPanel,
  mcpPanel,
  memoryPanel,
  harnessPanel,
  dataPanel,
  selectedTab,
  onSelectedTabChange,
}: {
  providersPanel: ReactNode
  workspacePanel: ReactNode
  advancedPanel?: ReactNode
  skillsPanel?: ReactNode
  mcpPanel?: ReactNode
  memoryPanel?: ReactNode
  harnessPanel?: ReactNode
  dataPanel: ReactNode
  selectedTab: SettingsTab
  onSelectedTabChange: (tab: SettingsTab) => void
}) {
  const tabs: Array<{ value: SettingsTab; label: string; panel: ReactNode }> = [
    { value: 'providers', label: 'Providers', panel: providersPanel },
    { value: 'workspace', label: 'Workspace', panel: workspacePanel },
  ]

  if (skillsPanel) {
    tabs.push({ value: 'skills', label: 'Skills', panel: skillsPanel })
  }

  if (mcpPanel) {
    tabs.push({ value: 'mcp', label: 'MCP', panel: mcpPanel })
  }

  if (memoryPanel) {
    tabs.push({ value: 'memory', label: 'Memory', panel: memoryPanel })
  }

  if (harnessPanel) {
    tabs.push({ value: 'harness', label: 'Harness', panel: harnessPanel })
  }

  tabs.push({ value: 'data', label: 'Data', panel: dataPanel })

  if (advancedPanel) {
    tabs.push({ value: 'advanced', label: 'Advanced', panel: advancedPanel })
  }

  return (
    <Card className="settings-card">
      <p className="eyebrow">Settings</p>

      <Tabs
        ariaLabel="Settings sections"
        value={selectedTab}
        onValueChange={onSelectedTabChange}
        tabs={tabs}
      />
    </Card>
  )
}
