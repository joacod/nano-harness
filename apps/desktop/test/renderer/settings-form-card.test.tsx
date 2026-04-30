// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultProviderSettings, providerDefaultModels, type AppSettings, type ProviderStatus } from '@nano-harness/shared'

import { SettingsFormCard } from '../../src/renderer/components/SettingsFormCard'

describe('SettingsFormCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows provider settings by default and moves workspace and data tools into separate tabs', async () => {
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
    expect(screen.queryByText('Backup and restore')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Workspace' }))

    expect(screen.getByRole('tab', { name: 'Workspace' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Workspace Root')).toBeTruthy()
    expect(screen.getByText('Approval Policy')).toBeTruthy()
    expect(screen.queryByText('Provider status')).toBeNull()
    expect(screen.queryByText('API Key')).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Data' }))

    expect(screen.getByRole('tab', { name: 'Data' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Backup and restore')).toBeTruthy()
    expect(screen.getByText('/tmp/nano-harness.db')).toBeTruthy()
    expect(screen.queryByText('Workspace Root')).toBeNull()
  })

  it('hides api key settings for providers that do not require an api key', async () => {
    const user = userEvent.setup()

    const { container } = renderSettingsFormCard()

    expect(screen.getAllByText('API Key').length).toBeGreaterThan(0)

    const providerSelect = container.querySelector<HTMLButtonElement>('[data-select-trigger="provider"]')

    if (!providerSelect) {
      throw new Error('Missing provider select trigger')
    }

    await user.click(providerSelect)
    await user.click(screen.getByRole('option', { name: 'llama.cpp' }))

    expect(screen.queryByText('API Key')).toBeNull()
  })

  it('shows ChatGPT sign-in controls for the OpenAI provider', async () => {
    const user = userEvent.setup()

    const { container } = renderSettingsFormCard()
    const providerSelect = container.querySelector<HTMLButtonElement>('[data-select-trigger="provider"]')

    if (!providerSelect) {
      throw new Error('Missing provider select trigger')
    }

    await user.click(providerSelect)
    await user.click(screen.getByRole('option', { name: 'OpenAI' }))

    expect(screen.getByText('ChatGPT Sign In')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with ChatGPT' })).toBeTruthy()
    expect(screen.queryByText('API Key')).toBeNull()
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
      isStartingOauth={false}
      isClearingApiKey={false}
      isClearingOauth={false}
      isExportingData={false}
      isImportingData={false}
      saveError={null}
      apiKeyError={null}
      oauthError={null}
      exportDataResult={null}
      importDataResult={null}
      dataError={null}
      onSubmit={vi.fn(async () => undefined)}
      onSaveApiKey={vi.fn(async () => undefined)}
      onClearApiKey={vi.fn(async () => undefined)}
      onStartOauth={vi.fn(async () => ({}))}
      onClearOauth={vi.fn(async () => undefined)}
      onExportData={vi.fn(async () => undefined)}
      onImportData={vi.fn(async () => undefined)}
    />,
  )
}

function createSettings(): AppSettings {
  return {
    provider: {
      ...createDefaultProviderSettings('openrouter'),
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
    model: providerDefaultModels.openrouter,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API key',
    apiKeyPresent: true,
    authMethod: 'api-key',
    authLabel: 'API key',
    authPresent: true,
    authMethods: [{ authMethod: 'api-key', label: 'API key', present: true }],
    isReady: true,
    issues: [],
    hints: [],
  }
}
