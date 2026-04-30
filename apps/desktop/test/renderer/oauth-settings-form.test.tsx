// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProviderStatus } from '@nano-harness/shared'

import { OAuthSettingsForm } from '../../src/renderer/components/settings/OAuthSettingsForm'

describe('OAuthSettingsForm', () => {
  afterEach(() => {
    cleanup()
  })

  it('starts ChatGPT OAuth and shows live success feedback', async () => {
    const user = userEvent.setup()
    const onStartOauth = vi.fn(async () => ({ accountId: 'account-1' }))

    render(
      <OAuthSettingsForm
        authError={null}
        isClearingAuth={false}
        isStartingOauth={false}
        provider="openai"
        providerStatus={createProviderStatus({ present: false })}
        onClearOauth={vi.fn(async () => undefined)}
        onStartOauth={onStartOauth}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }))

    await waitFor(() => {
      expect(onStartOauth).toHaveBeenCalledWith({ provider: 'openai' })
      expect(screen.getByText('Connected ChatGPT account account-1.')).toBeTruthy()
    })

    expect(screen.getByText('Connected ChatGPT account account-1.').getAttribute('aria-live')).toBe('polite')
  })

  it('clears ChatGPT OAuth and shows errors', async () => {
    const user = userEvent.setup()
    const onClearOauth = vi.fn(async () => undefined)

    render(
      <OAuthSettingsForm
        authError="OAuth failed"
        isClearingAuth={false}
        isStartingOauth={false}
        provider="openai"
        providerStatus={createProviderStatus({ present: true, accountId: 'account-1' })}
        onClearOauth={onClearOauth}
        onStartOauth={vi.fn(async () => ({}))}
      />,
    )

    expect(screen.getByText('account-1')).toBeTruthy()
    expect(screen.getByText('OAuth failed').getAttribute('aria-live')).toBe('polite')

    await user.click(screen.getByRole('button', { name: 'Clear ChatGPT sign-in' }))

    await waitFor(() => {
      expect(onClearOauth).toHaveBeenCalledWith({ provider: 'openai' })
      expect(screen.getByText('ChatGPT sign-in cleared.')).toBeTruthy()
    })
  })
})

function createProviderStatus(oauth: { present: boolean; accountId?: string }): ProviderStatus {
  return {
    providerId: 'chatgpt-subscription',
    providerLabel: 'OpenAI',
    model: 'gpt-5.4-mini',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    apiKeyLabel: 'Optional for this local provider',
    apiKeyPresent: false,
    authMethod: 'oauth',
    authLabel: 'ChatGPT account',
    authPresent: oauth.present,
    authMethods: [{ authMethod: 'oauth', label: 'ChatGPT account', present: oauth.present, accountId: oauth.accountId }],
    isReady: oauth.present,
    issues: oauth.present ? [] : ['Sign in with ChatGPT before starting an OpenAI run.'],
    hints: [],
  }
}
