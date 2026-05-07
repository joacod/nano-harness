import type { ReactNode } from 'react'

import { Card, Tabs } from './ui'

export type SettingsTab = 'providers' | 'workspace' | 'skills' | 'mcp' | 'memory' | 'harness' | 'data'

export function SettingsFormCard({
  providersPanel,
  workspacePanel,
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
  skillsPanel: ReactNode
  mcpPanel: ReactNode
  memoryPanel: ReactNode
  harnessPanel: ReactNode
  dataPanel: ReactNode
  selectedTab: SettingsTab
  onSelectedTabChange: (tab: SettingsTab) => void
}) {
  return (
    <Card className="settings-card">
      <p className="eyebrow">Settings</p>
      <h2>Configuration</h2>

      <Tabs
        ariaLabel="Settings sections"
        value={selectedTab}
        onValueChange={onSelectedTabChange}
        tabs={[
          {
            value: 'providers',
            label: 'Providers',
            panel: providersPanel,
          },
          {
            value: 'workspace',
            label: 'Workspace',
            panel: workspacePanel,
          },
          {
            value: 'skills',
            label: 'Skills',
            panel: skillsPanel,
          },
          {
            value: 'mcp',
            label: 'MCP',
            panel: mcpPanel,
          },
          {
            value: 'memory',
            label: 'Memory',
            panel: memoryPanel,
          },
          {
            value: 'harness',
            label: 'Harness',
            panel: harnessPanel,
          },
          {
            value: 'data',
            label: 'Data',
            panel: dataPanel,
          },
        ]}
      />
    </Card>
  )
}
