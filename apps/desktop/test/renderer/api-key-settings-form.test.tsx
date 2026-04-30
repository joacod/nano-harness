// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProviderStatus } from '@nano-harness/shared'

import { ApiKeySettingsForm } from '../../src/renderer/components/settings/ApiKeySettingsForm'

describe('ApiKeySettingsForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not submit blank API keys and keeps clear disabled when none is stored', async () => {
    const user = userEvent.setup()
    const onSaveApiKey = vi.fn(async () => undefined)

    render(
      <ApiKeySettingsForm
        apiKeyError={null}
        isClearingApiKey={false}
        isSavingApiKey={false}
        provider="openrouter"
        providerStatus={createProviderStatus({ apiKeyPresent: false })}
        onClearApiKey={vi.fn(async () => undefined)}
        onSaveApiKey={onSaveApiKey}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Save API key' }))

    expect(onSaveApiKey).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Clear API key' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves trimmed API keys, resets the field, and shows success feedback', async () => {
    const user = userEvent.setup()
    const onSaveApiKey = vi.fn(async () => undefined)

    const { container } = render(
      <ApiKeySettingsForm
        apiKeyError={null}
        isClearingApiKey={false}
        isSavingApiKey={false}
        provider="openrouter"
        providerStatus={createProviderStatus()}
        onClearApiKey={vi.fn(async () => undefined)}
        onSaveApiKey={onSaveApiKey}
      />,
    )

    const apiKeyInput = getRequiredElement<HTMLInputElement>(container, 'input[name="api-key"]')
    await user.type(apiKeyInput, '  secret-key  ')
    await user.click(screen.getByRole('button', { name: 'Save API key' }))

    await waitFor(() => {
      expect(onSaveApiKey).toHaveBeenCalledWith({
        provider: 'openrouter',
        apiKey: 'secret-key',
      })
    })

    expect(apiKeyInput.value).toBe('')
    expect(screen.getByText('API key saved securely on this device.')).toBeTruthy()
  })

  it('clears stored API keys and shows success feedback', async () => {
    const user = userEvent.setup()
    const onClearApiKey = vi.fn(async () => undefined)

    render(
      <ApiKeySettingsForm
        apiKeyError={null}
        isClearingApiKey={false}
        isSavingApiKey={false}
        provider="openrouter"
        providerStatus={createProviderStatus()}
        onClearApiKey={onClearApiKey}
        onSaveApiKey={vi.fn(async () => undefined)}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Clear API key' }))

    await waitFor(() => {
      expect(onClearApiKey).toHaveBeenCalledWith({ provider: 'openrouter' })
    })

    expect(screen.getByText('API key cleared.')).toBeTruthy()
  })
})

function createProviderStatus(overrides?: Partial<ProviderStatus>): ProviderStatus {
  return {
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    model: 'x-ai/grok-4.1-fast',
    baseUrl: 'https://openrouter.ai/api/v1',
    isReady: true,
    apiKeyPresent: true,
    apiKeyLabel: 'OpenRouter API key',
    issues: [],
    hints: [],
    ...overrides,
  }
}

function getRequiredElement<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing element for selector: ${selector}`)
  }

  return element
}
