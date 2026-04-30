// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings, ProviderStatus } from '@nano-harness/shared'

import { SettingsRoute } from '../../src/renderer/routes/SettingsRoute'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

type MockSettingsFormCardProps = {
  initialSettings: AppSettings
  dataPath: string | null
  providerStatus: ProviderStatus | null
  isSaving: boolean
  isSavingApiKey: boolean
  isClearingApiKey: boolean
  isExportingData: boolean
  isImportingData: boolean
  saveError: string | null
  apiKeyError: string | null
  exportDataResult: string | null
  importDataResult: string | null
  dataError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
  onSaveApiKey: (input: { provider: AppSettings['provider']['provider']; apiKey: string }) => Promise<void>
  onClearApiKey: (input: { provider: AppSettings['provider']['provider'] }) => Promise<void>
  onExportData: () => Promise<void>
  onImportData: () => Promise<void>
}

let latestSettingsFormCardProps: MockSettingsFormCardProps | null = null

vi.mock('../../src/renderer/components/SettingsFormCard', () => ({
  SettingsFormCard(props: MockSettingsFormCardProps) {
    latestSettingsFormCardProps = props

    return (
      <section>
        <p>Mock settings form</p>
        <p>dataPath:{props.dataPath ?? 'null'}</p>
        <p>provider:{props.providerStatus?.providerLabel ?? 'none'}</p>
        <p>export:{props.exportDataResult ?? 'none'}</p>
        <p>import:{props.importDataResult ?? 'none'}</p>
        <p>saveError:{props.saveError ?? 'none'}</p>
        <p>apiKeyError:{props.apiKeyError ?? 'none'}</p>
        <p>dataError:{props.dataError ?? 'none'}</p>
        <button type="button" onClick={() => void props.onSubmit(createSettings({ provider: { model: 'next/model' } }))}>
          Save settings action
        </button>
        <button type="button" onClick={() => void props.onSaveApiKey({ provider: 'openrouter', apiKey: 'secret-key' })}>
          Save api key action
        </button>
        <button type="button" onClick={() => void props.onClearApiKey({ provider: 'openrouter' })}>
          Clear api key action
        </button>
        <button type="button" onClick={() => void props.onExportData()}>
          Export action
        </button>
        <button type="button" onClick={() => void props.onImportData()}>
          Import action
        </button>
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
    const saveProviderApiKey = vi.fn(async () => undefined)
    const clearProviderApiKey = vi.fn(async () => undefined)
    const exportData = vi.fn(async () => ({ exportedFilePath: '/tmp/export.zip' }))
    const importData = vi.fn(async () => ({ imported: true, backupFilePath: '/tmp/backup.zip' }))

    window.desktop = createDesktopMock({
      getContext: async () => ({ platform: 'darwin', version: '0.0.1', dataPath: '/tmp/nano-harness.db' }),
      getSettings: async () => createSettings(),
      getProviderStatus: async () => createProviderStatus(),
      saveSettings,
      saveProviderApiKey,
      clearProviderApiKey,
      exportData,
      importData,
    })

    const { queryClient } = renderWithQueryClient(<SettingsRoute />)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    expect(await screen.findByText('Mock settings form')).toBeTruthy()
    expect(screen.getByText('dataPath:/tmp/nano-harness.db')).toBeTruthy()
    expect(screen.getByText('provider:OpenRouter')).toBeTruthy()
    expect(latestSettingsFormCardProps?.initialSettings.provider.model).toBe('x-ai/grok-4.1-fast')

    await user.click(screen.getByRole('button', { name: 'Save settings action' }))
    await user.click(screen.getByRole('button', { name: 'Save api key action' }))
    await user.click(screen.getByRole('button', { name: 'Clear api key action' }))
    await user.click(screen.getByRole('button', { name: 'Export action' }))
    await user.click(screen.getByRole('button', { name: 'Import action' }))

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith(createSettings({ provider: { model: 'next/model' } }))
      expect(saveProviderApiKey).toHaveBeenCalledWith({ provider: 'openrouter', apiKey: 'secret-key' })
      expect(clearProviderApiKey).toHaveBeenCalledWith({ provider: 'openrouter' })
      expect(exportData).toHaveBeenCalledTimes(1)
      expect(importData).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['provider-status'] })
      expect(screen.getByText('export:/tmp/export.zip')).toBeTruthy()
      expect(screen.getByText('import:/tmp/backup.zip')).toBeTruthy()
    })
  })
})

function createSettings(overrides?: {
  provider?: Partial<AppSettings['provider']>
  workspace?: Partial<AppSettings['workspace']>
}): AppSettings {
  return {
    provider: {
      provider: 'openrouter',
      model: 'x-ai/grok-4.1-fast',
      reasoning: { mode: 'auto' },
      ...overrides?.provider,
    },
    workspace: {
      rootPath: '/Users/test/workspace',
      approvalPolicy: 'always',
      ...overrides?.workspace,
    },
  }
}

function createProviderStatus(overrides?: Partial<ProviderStatus>): ProviderStatus {
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
    ...overrides,
  }
}
