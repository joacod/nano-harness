// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { SettingsFormCard, type SettingsTab } from '../../src/renderer/components/SettingsFormCard'
import { renderWithQueryClient } from './test-utils'

describe('SettingsFormCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders each supplied settings panel in its tab', async () => {
    const user = userEvent.setup()

    renderSettingsFormCard()

    expect(screen.getByRole('tab', { name: 'Providers' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Provider status')).toBeTruthy()
    expect(screen.getAllByText('OpenRouter').length).toBeGreaterThan(0)
    expect(screen.getAllByText('API Key').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Model').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Base URL').length).toBeGreaterThan(0)
    expect(screen.queryByText('Workspace Root')).toBeNull()
    expect(screen.queryByText('Approval Policy')).toBeNull()
    expect(screen.queryByText('Skills hub')).toBeNull()
    expect(screen.queryByText('MCP inventory')).toBeNull()
    expect(screen.queryByText('Backup and restore')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Workspace' }))

    expect(screen.getByRole('tab', { name: 'Workspace' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Workspace Root')).toBeTruthy()
    expect(screen.getByText('Approval Policy')).toBeTruthy()
    expect(screen.queryByText('Provider status')).toBeNull()
    expect(screen.queryByText('API Key')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Skills' }))

    expect(screen.getByRole('tab', { name: 'Skills' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Skills hub')).toBeTruthy()
    expect(screen.getByText('Repo Onboarding')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'enabled' })).toBeTruthy()
    expect(screen.queryByText('Workspace Root')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'MCP' }))

    expect(screen.getByRole('tab', { name: 'MCP' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('MCP inventory')).toBeTruthy()
    expect(screen.getByText('No MCP servers configured.')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Data' }))

    expect(screen.getByRole('tab', { name: 'Data' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Backup and restore')).toBeTruthy()
    expect(screen.getByText('/tmp/nano-harness.db')).toBeTruthy()
    expect(screen.queryByText('Workspace Root')).toBeNull()
  })
})

function renderSettingsFormCard() {
  return renderWithQueryClient(
    <SettingsFormCardHarness />,
  )
}

function SettingsFormCardHarness() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('providers')

  return (
    <SettingsFormCard
      providersPanel={<div><p>Provider status</p><p>OpenRouter</p><p>API Key</p><p>Model</p><p>Base URL</p></div>}
      workspacePanel={<div><p>Workspace Root</p><p>Approval Policy</p></div>}
      skillsPanel={<div><p>Skills hub</p><p>Repo Onboarding</p><button type="button" role="switch">enabled</button></div>}
      mcpPanel={<div><p>MCP inventory</p><p>No MCP servers configured.</p></div>}
      memoryPanel={<div><p>Memory Proposals</p></div>}
      harnessPanel={<div><p>Harness</p></div>}
      dataPanel={<div><p>Backup and restore</p><p>/tmp/nano-harness.db</p></div>}
      selectedTab={selectedTab}
      onSelectedTabChange={setSelectedTab}
    />
  )
}
