import { describe, expect, it, vi } from 'vitest'

import { createProviderCredentialResolver } from '../../src/main/provider-credential-resolver'

type StoredPayload = Record<string, unknown>

function createStore(encryptedPayload: string | null = null) {
  return {
    getEncryptedProviderCredentialPayload: vi.fn(async () => encryptedPayload),
    saveProviderCredentialPayload: vi.fn(async () => {}),
  }
}

function createResolver(input: {
  encryptedPayload?: string | null
  payloads?: Record<string, StoredPayload>
  refreshers?: Parameters<typeof createProviderCredentialResolver>[0]['refreshers']
  now?: () => number
} = {}) {
  const store = createStore(input.encryptedPayload ?? null)
  const payloads = input.payloads ?? {}
  const decryptCredentialPayload = vi.fn((payload: string) => payloads[payload])
  const encryptCredentialPayload = vi.fn((payload: unknown) => `encrypted:${JSON.stringify(payload)}`)
  const resolver = createProviderCredentialResolver({
    store,
    decryptCredentialPayload,
    encryptCredentialPayload,
    refreshers: input.refreshers,
    now: input.now,
  })

  return {
    resolver,
    store,
    decryptCredentialPayload,
    encryptCredentialPayload,
  }
}

describe('createProviderCredentialResolver', () => {
  it('returns none auth without reading stored credentials for providers with no auth', async () => {
    const { resolver, store } = createResolver()

    await expect(resolver.getProviderAuth({ provider: 'llama-cpp' })).resolves.toEqual({ authMethod: 'none' })
    expect(store.getEncryptedProviderCredentialPayload).not.toHaveBeenCalled()
  })

  it('rejects auth methods unsupported by the provider', async () => {
    const { resolver, store } = createResolver()

    await expect(resolver.getProviderAuth({ provider: 'openrouter', authMethod: 'oauth' })).rejects.toThrow(
      'OpenRouter does not support oauth auth.',
    )
    expect(store.getEncryptedProviderCredentialPayload).not.toHaveBeenCalled()
  })

  it('returns none auth when a supported credential is missing', async () => {
    const { resolver, store } = createResolver()

    await expect(resolver.getProviderAuth({ provider: 'openrouter' })).resolves.toEqual({ authMethod: 'none' })
    expect(store.getEncryptedProviderCredentialPayload).toHaveBeenCalledWith('openrouter', 'api-key')
  })

  it('decrypts and returns stored API key credentials', async () => {
    const { resolver, decryptCredentialPayload } = createResolver({
      encryptedPayload: 'api-key-payload',
      payloads: {
        'api-key-payload': { authMethod: 'api-key', apiKey: 'secret-key' },
      },
    })

    await expect(resolver.getProviderAuth({ provider: 'openrouter' })).resolves.toEqual({
      authMethod: 'api-key',
      apiKey: 'secret-key',
    })
    expect(decryptCredentialPayload).toHaveBeenCalledWith('api-key-payload')
  })

  it('rejects invalid stored credentials', async () => {
    const { resolver } = createResolver({
      encryptedPayload: 'invalid-payload',
      payloads: {
        'invalid-payload': { authMethod: 'api-key', apiKey: '' },
      },
    })

    await expect(resolver.getProviderAuth({ provider: 'openrouter' })).rejects.toThrow()
  })

  it('rejects stored credentials with the wrong auth method', async () => {
    const { resolver } = createResolver({
      encryptedPayload: 'oauth-payload',
      payloads: {
        'oauth-payload': {
          authMethod: 'oauth',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: 2_000_000,
        },
      },
    })

    await expect(resolver.getProviderAuth({ provider: 'openrouter' })).rejects.toThrow(
      'Stored credential does not match OpenRouter api-key auth.',
    )
  })

  it('returns fresh OAuth credentials without refreshing them', async () => {
    const refresher = vi.fn()
    const { resolver } = createResolver({
      encryptedPayload: 'oauth-payload',
      payloads: {
        'oauth-payload': {
          authMethod: 'oauth',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: 2_000_000,
          accountId: 'account-1',
        },
      },
      refreshers: { openai: refresher },
      now: () => 1_000_000,
    })

    await expect(resolver.getProviderAuth({ provider: 'openai' })).resolves.toEqual({
      authMethod: 'oauth',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 2_000_000,
      accountId: 'account-1',
    })
    expect(refresher).not.toHaveBeenCalled()
  })

  it('refreshes OAuth credentials that expire within one minute', async () => {
    const refreshedCredential = {
      authMethod: 'oauth' as const,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: 3_000_000,
      accountId: 'account-1',
    }
    const refresher = vi.fn(async () => refreshedCredential)
    const { resolver, store, encryptCredentialPayload } = createResolver({
      encryptedPayload: 'oauth-payload',
      payloads: {
        'oauth-payload': {
          authMethod: 'oauth',
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          expiresAt: 1_050_000,
          accountId: 'account-1',
        },
      },
      refreshers: { openai: refresher },
      now: () => 1_000_000,
    })

    await expect(resolver.getProviderAuth({ provider: 'openai' })).resolves.toEqual(refreshedCredential)
    expect(refresher).toHaveBeenCalledWith({
      authMethod: 'oauth',
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: 1_050_000,
      accountId: 'account-1',
    })
    expect(encryptCredentialPayload).toHaveBeenCalledWith(refreshedCredential)
    expect(store.saveProviderCredentialPayload).toHaveBeenCalledWith(
      'openai',
      'oauth',
      'encrypted:{"authMethod":"oauth","accessToken":"new-access-token","refreshToken":"new-refresh-token","expiresAt":3000000,"accountId":"account-1"}',
    )
  })
})
