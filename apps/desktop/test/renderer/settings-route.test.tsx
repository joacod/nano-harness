// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultProviderSettings, providerDefaultModels, type AppSettings, type ProviderStatus } from '@nano-harness/shared'

import { SettingsRoute } from '../../src/renderer/routes/SettingsRoute'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

type MockSettingsFormCardProps = {
  providersPanel: ReactNode
  workspacePanel: ReactNode
  skillsPanel: ReactNode
  mcpPanel: ReactNode
  memoryPanel: ReactNode
  harnessPanel: ReactNode
  dataPanel: ReactNode
}

let latestSettingsFormCardProps: MockSettingsFormCardProps | null = null

vi.mock('../../src/renderer/components/SettingsFormCard', () => ({
  SettingsFormCard(props: MockSettingsFormCardProps) {
    latestSettingsFormCardProps = props

    return (
      <section>
        <p>Mock settings form</p>
        {props.providersPanel}
        {props.workspacePanel}
        {props.skillsPanel}
        {props.mcpPanel}
        {props.memoryPanel}
        {props.harnessPanel}
        {props.dataPanel}
      </section>
    )
  },
}))

describe('SettingsRoute', () => {
  beforeEach(() => {
    latestSettingsFormCardProps = null
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the loading state until settings are available', () => {
    window.desktop = createDesktopMock({
      getSettings: async () => null,
    })

    renderWithQueryClient(<SettingsRoute />)

    expect(screen.getByText('Loading provider settings…')).toBeTruthy()
  })

  it('loads settings data and wires mutations to the desktop bridge', async () => {
    const user = userEvent.setup()
    const saveSettings = vi.fn(async (settings: AppSettings) => settings)
    const exportData = vi.fn(async () => ({ exportedFilePath: '/tmp/export.zip' }))
    const importData = vi.fn(async () => ({ imported: true, backupFilePath: '/tmp/backup.zip' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    window.desktop = createDesktopMock({
      getContext: async () => ({ platform: 'darwin', version: '0.0.1', dataPath: '/tmp/nano-harness.db' }),
      getSettings: async () => createSettings(),
      getProviderStatus: async () => createProviderStatus(),
      listSkills: async () => ({
        skills: [{
          id: 'repo-onboarding',
          name: 'Repo Onboarding',
          description: 'Survey repositories.',
          triggers: ['repo'],
          tools: ['grep'],
          safetyNotes: [],
          source: 'bundled',
          enabled: true,
        }],
      }),
      listMcpInventory: async () => ({ servers: [], tools: [], resources: [] }),
      saveSettings,
      exportData,
      importData,
    })

    const { queryClient } = renderWithQueryClient(<SettingsRoute />)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(await screen.findByText('Mock settings form')).toBeTruthy()
    expect(await screen.findByText('/tmp/nano-harness.db')).toBeTruthy()
    expect(screen.getAllByText('OpenRouter').length).toBeGreaterThan(0)
    expect(await screen.findByText('Repo Onboarding')).toBeTruthy()
    expect(screen.getByText('No MCP servers configured.')).toBeTruthy()
    expect(latestSettingsFormCardProps?.providersPanel).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Export data' }))
    await user.click(screen.getByRole('button', { name: 'Import data' }))
    await user.click(screen.getByRole('switch', { name: 'enabled' }))

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith(createSettings({ skills: { disabledSkillIds: ['repo-onboarding'] } }))
      expect(exportData).toHaveBeenCalledTimes(1)
      expect(importData).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings'] })
      expect(screen.getByText('Exported to /tmp/export.zip')).toBeTruthy()
      expect(screen.getByText('Safety backup created at /tmp/backup.zip')).toBeTruthy()
    })
  })
})

function createSettings(overrides?: {
  provider?: Partial<AppSettings['provider']>
  workspace?: Partial<AppSettings['workspace']>
  skills?: AppSettings['skills']
}): AppSettings {
  return {
    provider: {
      ...createDefaultProviderSettings('openrouter'),
      reasoning: { mode: 'auto' },
      ...overrides?.provider,
    },
    workspace: {
      rootPath: '/Users/test/workspace',
      approvalPolicy: 'always',
      ...overrides?.workspace,
    },
    ...(overrides?.skills ? { skills: overrides.skills } : {}),
  }
}

function createProviderStatus(overrides?: Partial<ProviderStatus>): ProviderStatus {
  return {
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    model: providerDefaultModels.openrouter,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API key',
    apiKeyPresent: true,
    isReady: true,
    issues: [],
    hints: [],
    ...overrides,
  }
}
