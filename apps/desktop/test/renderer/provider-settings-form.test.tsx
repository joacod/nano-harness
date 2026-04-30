// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings } from '@nano-harness/shared'

import { ProviderSettingsForm } from '../../src/renderer/components/settings/ProviderSettingsForm'

describe('ProviderSettingsForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('submits trimmed settings and maps reasoning effort selections', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => undefined)

    const { container } = render(
      <ProviderSettingsForm
        initialSettings={createSettings()}
        isSaving={false}
        saveError={null}
        onProviderChange={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    const modelInput = getRequiredElement<HTMLInputElement>(container, 'input[name="model"]')
    const baseUrlInput = getRequiredElement<HTMLInputElement>(container, 'input[name="provider-base-url"]')
    const reasoningSelect = getRequiredElement<HTMLButtonElement>(container, '[data-select-trigger="provider-reasoning"]')
    const workspaceInput = getRequiredElement<HTMLInputElement>(container, 'input[name="workspace-root"]')
    const approvalPolicySelect = getRequiredElement<HTMLButtonElement>(container, '[data-select-trigger="approval-policy"]')

    await user.clear(modelInput)
    await user.type(modelInput, '  tuned/model  ')
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, '  http://localhost:9999/v1  ')
    await selectCustomOption(user, reasoningSelect, 'high effort')
    await user.clear(workspaceInput)
    await user.type(workspaceInput, '  /tmp/nano-harness  ')
    await selectCustomOption(user, approvalPolicySelect, 'never')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        provider: {
          provider: 'openrouter',
          model: 'tuned/model',
          baseUrl: 'http://localhost:9999/v1',
          reasoning: { mode: 'effort', effort: 'high' },
        },
        workspace: {
          rootPath: '/tmp/nano-harness',
          approvalPolicy: 'never',
        },
      })
    })

    expect(screen.getByText('Settings saved.')).toBeTruthy()
  })

  it('restores the provider default model when defaults are requested', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <ProviderSettingsForm
        initialSettings={createSettings({ provider: { model: 'custom/model', baseUrl: 'http://localhost:9999/v1' } })}
        isSaving={false}
        saveError={null}
        onProviderChange={() => undefined}
        onSubmit={vi.fn(async () => undefined)}
      />,
    )

    const modelInput = getRequiredElement<HTMLInputElement>(container, 'input[name="model"]')
    const baseUrlInput = getRequiredElement<HTMLInputElement>(container, 'input[name="provider-base-url"]')
    await user.clear(modelInput)
    await user.type(modelInput, 'another/model')
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, 'http://localhost:9999/v1')
    await user.click(screen.getByRole('button', { name: 'Use defaults' }))

    expect(modelInput.value).toBe('x-ai/grok-4.1-fast')
    expect(baseUrlInput.value).toBe('https://openrouter.ai/api/v1')
  })

  it('switches to llama.cpp defaults', async () => {
    const user = userEvent.setup()
    const onProviderChange = vi.fn()

    const { container } = render(
      <ProviderSettingsForm
        initialSettings={createSettings()}
        isSaving={false}
        saveError={null}
        onProviderChange={onProviderChange}
        onSubmit={vi.fn(async () => undefined)}
      />,
    )

    const providerSelect = getRequiredElement<HTMLButtonElement>(container, '[data-select-trigger="provider"]')
    const modelInput = getRequiredElement<HTMLInputElement>(container, 'input[name="model"]')
    const baseUrlInput = getRequiredElement<HTMLInputElement>(container, 'input[name="provider-base-url"]')

    await selectCustomOption(user, providerSelect, 'llama.cpp')

    expect(onProviderChange).toHaveBeenCalledWith('llama-cpp')
    expect(modelInput.value).toBe('local-model')
    expect(baseUrlInput.value).toBe('http://127.0.0.1:8080/v1')
  })
})

function createSettings(overrides?: {
  provider?: Partial<AppSettings['provider']>
  workspace?: Partial<AppSettings['workspace']>
}): AppSettings {
  return {
    provider: {
      provider: 'openrouter',
      model: 'custom/model',
      baseUrl: 'https://openrouter.ai/api/v1',
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

function getRequiredElement<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing element for selector: ${selector}`)
  }

  return element
}

async function selectCustomOption(user: ReturnType<typeof userEvent.setup>, trigger: HTMLButtonElement, optionName: string) {
  await user.click(trigger)
  await user.click(screen.getByRole('option', { name: optionName }))
}
