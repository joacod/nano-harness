import type { ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'

import type { StoredProviderCredential } from '../../../../packages/shared/src'

const OPENAI_AUTH_ISSUER = 'https://auth.openai.com'
// Public OAuth client id used by the official OpenAI Codex CLI/desktop login flow.
// This is an identifier, not a secret. Keep the redirect URI and authorize params
// aligned with the Codex flow because they are part of the registered client policy.
const OPENAI_CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const OPENAI_OAUTH_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const OPENAI_OAUTH_PORT = 1455
const OPENAI_OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_TOKEN_EXPIRES_IN_SECONDS = 60 * 60
const OAUTH_CALLBACK_PATH = '/auth/callback'

type OpenAIChatGptTokens = {
  id_token?: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

export type OpenAIChatGptOAuthCredential = Extract<StoredProviderCredential, { authMethod: 'oauth' }>

type Pkce = {
  verifier: string
  challenge: string
}

type StartOAuthOptions = {
  openExternal?: (url: string) => Promise<void>
  timeoutMs?: number
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function generatePkce(): Promise<Pkce> {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())

  return { verifier, challenge }
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(32))
}

export function buildAuthorizeUrl(input: { redirectUri: string; state: string; pkce: Pkce }): string {
  const url = new URL('/oauth/authorize', OPENAI_AUTH_ISSUER)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', OPENAI_CODEX_OAUTH_CLIENT_ID)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', OPENAI_OAUTH_SCOPE)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'nano-harness')

  return url.toString()
}

export async function exchangeCodeForTokens(code: string, redirectUri: string, pkce: Pkce): Promise<OpenAIChatGptTokens> {
  return await requestOpenAIChatGptTokens({
    grant_type: 'authorization_code',
    client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  })
}

export async function refreshOpenAIChatGptCredential(
  credential: OpenAIChatGptOAuthCredential,
): Promise<OpenAIChatGptOAuthCredential> {
  const tokens = await requestOpenAIChatGptTokens({
    grant_type: 'refresh_token',
    client_id: OPENAI_CODEX_OAUTH_CLIENT_ID,
    refresh_token: credential.refreshToken,
  })

  return toCredential(tokens, credential.accountId)
}

export function extractAccountId(tokens: Pick<OpenAIChatGptTokens, 'access_token' | 'id_token'>): string | undefined {
  for (const token of [tokens.id_token, tokens.access_token]) {
    const payload = parseJwtPayload(token)
    const accountId = getAccountIdFromPayload(payload)

    if (accountId) {
      return accountId
    }
  }

  return undefined
}

export async function startOpenAIChatGptOAuth(options: StartOAuthOptions = {}): Promise<OpenAIChatGptOAuthCredential> {
  const pkce = await generatePkce()
  const state = generateState()
  const redirectUri = `http://localhost:${OPENAI_OAUTH_PORT}${OAUTH_CALLBACK_PATH}`
  const authorizeUrl = buildAuthorizeUrl({ redirectUri, state, pkce })
  const timeoutMs = options.timeoutMs ?? OPENAI_OAUTH_TIMEOUT_MS

  return await new Promise<OpenAIChatGptOAuthCredential>((resolve, reject) => {
    let isListening = false
    const server = createServer((request, response) => {
      void handleCallbackRequest({
        requestUrl: request.url,
        response,
        redirectUri,
        expectedState: state,
        pkce,
        resolve,
        reject,
        cleanup,
      })
    })
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('OpenAI sign-in timed out.'))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timeout)

      if (isListening) {
        server.close()
      }
    }

    server.once('error', (error) => {
      cleanup()
      reject(error)
    })

    server.listen(OPENAI_OAUTH_PORT, '127.0.0.1', () => {
      isListening = true
      options.openExternal?.(authorizeUrl).catch((error: unknown) => {
        cleanup()
        reject(error)
      })
    })
  })
}

async function requestOpenAIChatGptTokens(body: Record<string, string>): Promise<OpenAIChatGptTokens> {
  const response = await fetch(new URL('/oauth/token', OPENAI_AUTH_ISSUER), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  if (!response.ok) {
    throw new Error(`OpenAI token exchange failed: ${response.status}`)
  }

  const payload = await response.json() as Partial<OpenAIChatGptTokens>

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error('OpenAI token exchange returned an invalid response.')
  }

  return {
    id_token: payload.id_token,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
  }
}

async function handleCallbackRequest(input: {
  requestUrl: string | undefined
  response: ServerResponse
  redirectUri: string
  expectedState: string
  pkce: Pkce
  resolve: (credential: OpenAIChatGptOAuthCredential) => void
  reject: (error: Error) => void
  cleanup: () => void
}) {
  const url = new URL(input.requestUrl ?? '/', input.redirectUri)

  if (url.pathname !== OAUTH_CALLBACK_PATH) {
    input.response.writeHead(404)
    input.response.end('Not found')
    return
  }

  if (url.searchParams.get('state') !== input.expectedState) {
    writeHtml(input.response, 400, 'OpenAI sign-in returned an invalid state.')
    input.cleanup()
    input.reject(new Error('OpenAI sign-in returned an invalid state.'))
    return
  }

  const code = url.searchParams.get('code')

  if (!code) {
    writeHtml(input.response, 400, 'OpenAI sign-in did not return an authorization code.')
    input.cleanup()
    input.reject(new Error('OpenAI sign-in did not return an authorization code.'))
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code, input.redirectUri, input.pkce)
    writeHtml(input.response, 200, 'OpenAI sign-in complete. You can close this window.')
    input.cleanup()
    input.resolve(toCredential(tokens))
  } catch (error) {
    writeHtml(input.response, 500, 'OpenAI sign-in failed. Return to Nano Harness and try again.')
    input.cleanup()
    input.reject(error instanceof Error ? error : new Error('OpenAI sign-in failed.'))
  }
}

function toCredential(tokens: OpenAIChatGptTokens, fallbackAccountId?: string): OpenAIChatGptOAuthCredential {
  return {
    authMethod: 'oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? DEFAULT_TOKEN_EXPIRES_IN_SECONDS) * 1000,
    accountId: extractAccountId(tokens) ?? fallbackAccountId,
  }
}

function writeHtml(response: ServerResponse, statusCode: number, message: string) {
  response.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html><html><body><p>${escapeHtml(message)}</p></body></html>`)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseJwtPayload(token: string | undefined): unknown {
  if (!token) {
    return null
  }

  const [, encodedPayload] = token.split('.')

  if (!encodedPayload) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function getAccountIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const claims = payload as Record<string, unknown>
  const directAccountId = getStringClaim(claims, 'chatgpt_account_id')
    ?? getStringClaim(claims, 'https://api.openai.com/auth.chatgpt_account_id')

  if (directAccountId) {
    return directAccountId
  }

  const organizations = claims.organizations

  if (Array.isArray(organizations)) {
    const firstOrganization = organizations[0]

    if (firstOrganization && typeof firstOrganization === 'object') {
      return getStringClaim(firstOrganization as Record<string, unknown>, 'id')
    }
  }

  return undefined
}

function getStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}
