import type { ProviderCredentialResolver } from '../../../../packages/core/src'
import {
  getProviderDefinition,
  providerAuthSchema,
  storedProviderCredentialSchema,
  type ProviderAuth,
  type ProviderAuthMethod,
  type ProviderKey,
  type StoredProviderCredential,
} from '../../../../packages/shared/src'

type ProviderCredentialStore = {
  getEncryptedProviderCredentialPayload(provider: ProviderKey, authMethod: ProviderAuthMethod): Promise<string | null>
  saveProviderCredentialPayload(provider: ProviderKey, authMethod: ProviderAuthMethod, encryptedPayload: string): Promise<void>
}

type ProviderOAuthCredential = Extract<StoredProviderCredential, { authMethod: 'oauth' }>

type ProviderCredentialRefresher = (credential: ProviderOAuthCredential) => Promise<ProviderOAuthCredential>

export function createProviderCredentialResolver(input: {
  store: ProviderCredentialStore
  decryptCredentialPayload: (payload: string) => unknown
  encryptCredentialPayload: (payload: unknown) => string
  refreshers?: Partial<Record<ProviderKey, ProviderCredentialRefresher>>
  now?: () => number
}): ProviderCredentialResolver {
  const now = input.now ?? Date.now

  return {
    async getProviderAuth(request): Promise<ProviderAuth> {
      const providerDefinition = getProviderDefinition(request.provider)
      const authMethod = request.authMethod ?? providerDefinition.defaultAuthMethod

      if (!(providerDefinition.authMethods as readonly ProviderAuthMethod[]).includes(authMethod)) {
        throw new Error(`${providerDefinition.label} does not support ${authMethod} auth.`)
      }

      if (authMethod === 'none') {
        return { authMethod: 'none' }
      }

      const encryptedPayload = await input.store.getEncryptedProviderCredentialPayload(request.provider, authMethod)

      if (!encryptedPayload) {
        return providerAuthSchema.parse({ authMethod: 'none' })
      }

      const credential = storedProviderCredentialSchema.parse(input.decryptCredentialPayload(encryptedPayload))

      if (credential.authMethod !== authMethod) {
        throw new Error(`Stored credential does not match ${providerDefinition.label} ${authMethod} auth.`)
      }

      const refresher = input.refreshers?.[request.provider]

      if (refresher && credential.authMethod === 'oauth' && credential.expiresAt <= now() + 60_000) {
        const refreshedCredential = await refresher(credential)

        await input.store.saveProviderCredentialPayload(
          request.provider,
          authMethod,
          input.encryptCredentialPayload(refreshedCredential),
        )

        return providerAuthSchema.parse(refreshedCredential)
      }

      return providerAuthSchema.parse(credential)
    },
  }
}
