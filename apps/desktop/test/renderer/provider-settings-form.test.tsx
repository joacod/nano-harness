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
    const reasoningSelect = getRequiredElement<HTMLSelectElement>(container, 'select[name="provider-reasoning"]')
    const workspaceInput = getRequiredElement<HTMLInputElement>(container, 'input[name="workspace-root"]')
    const approvalPolicySelect = getRequiredElement<HTMLSelectElement>(container, 'select[name="approval-policy"]')

    await user.clear(modelInput)
    await user.type(modelInput, '  tuned/model  ')
    await user.selectOptions(reasoningSelect, 'high')
    await user.clear(workspaceInput)
    await user.type(workspaceInput, '  /tmp/nano-harness  ')
    await user.selectOptions(approvalPolicySelect, 'never')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        provider: {
          provider: 'openrouter',
          model: 'tuned/model',
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
        initialSettings={createSettings({ provider: { model: 'custom/model' } })}
        isSaving={false}
        saveError={null}
        onProviderChange={() => undefined}
        onSubmit={vi.fn(async () => undefined)}
      />,
    )

    const modelInput = getRequiredElement<HTMLInputElement>(container, 'input[name="model"]')
    await user.clear(modelInput)
    await user.type(modelInput, 'another/model')
    await user.click(screen.getByRole('button', { name: 'Use defaults' }))

    expect(modelInput.value).toBe('x-ai/grok-4.1-fast')
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
