import { z } from 'zod'

export const storedProviderCredentialSchema = z.discriminatedUnion('authMethod', [
  z.object({ authMethod: z.literal('api-key'), apiKey: z.string().min(1) }),
  z.object({
    authMethod: z.literal('oauth'),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number().int().positive(),
    accountId: z.string().min(1).optional(),
  }),
])

export type StoredProviderCredential = z.infer<typeof storedProviderCredentialSchema>

export const providerAuthSchema = z.discriminatedUnion('authMethod', [
  z.object({ authMethod: z.literal('none') }),
  z.object({ authMethod: z.literal('api-key'), apiKey: z.string().min(1) }),
  z.object({
    authMethod: z.literal('oauth'),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number().int().positive(),
    accountId: z.string().min(1).optional(),
  }),
])

export type ProviderAuth = z.infer<typeof providerAuthSchema>
