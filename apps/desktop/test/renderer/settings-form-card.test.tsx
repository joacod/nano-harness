// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings, ProviderStatus } from '@nano-harness/shared'

import { SettingsFormCard } from '../../src/renderer/components/SettingsFormCard'

describe('SettingsFormCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows provider settings by default and moves data tools into a separate tab', async () => {
    const user = userEvent.setup()

    renderSettingsFormCard()

    expect(screen.getByRole('tab', { name: 'Providers' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Provider status')).toBeTruthy()
    expect(screen.getAllByText('OpenRouter').length).toBeGreaterThan(0)
    expect(screen.queryByText('Backup and restore')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Data' }))

    expect(screen.getByRole('tab', { name: 'Data' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Backup and restore')).toBeTruthy()
    expect(screen.getByText('/tmp/nano-harness.db')).toBeTruthy()
    expect(screen.queryByText('Provider status')).toBeNull()
  })
})

function renderSettingsFormCard() {
  return render(
    <SettingsFormCard
      initialSettings={createSettings()}
      dataPath="/tmp/nano-harness.db"
      providerStatus={createProviderStatus()}
      isSaving={false}
      isSavingApiKey={false}
      isClearingApiKey={false}
      isExportingData={false}
      isImportingData={false}
      saveError={null}
      apiKeyError={null}
      exportDataResult={null}
      importDataResult={null}
      dataError={null}
      onSubmit={vi.fn(async () => undefined)}
      onSaveApiKey={vi.fn(async () => undefined)}
      onClearApiKey={vi.fn(async () => undefined)}
      onExportData={vi.fn(async () => undefined)}
      onImportData={vi.fn(async () => undefined)}
    />,
  )
}

function createSettings(): AppSettings {
  return {
    provider: {
      provider: 'openrouter',
      model: 'x-ai/grok-4.1-fast',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: { mode: 'auto' },
    },
    workspace: {
      rootPath: '/Users/test/workspace',
      approvalPolicy: 'always',
    },
  }
}

function createProviderStatus(): ProviderStatus {
  return {
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    model: 'x-ai/grok-4.1-fast',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API key',
    apiKeyPresent: true,
    isReady: true,
    issues: [],
    hints: [],
  }
}
