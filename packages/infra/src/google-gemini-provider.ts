import type { ActionDefinition, JsonValue, Message } from '@nano-harness/shared'
import { createProviderInstructions, type Provider, type ProviderActionRequest, type ProviderGenerateInput, type ProviderGenerateResult } from '@nano-harness/core'

import { parseSseData, splitSseEvents } from './sse'

type FetchLike = typeof fetch

type GoogleGeminiProviderOptions = {
  fetch?: FetchLike
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiFunctionDeclaration = {
  name: string
  description?: string
  parameters: Record<string, unknown>
}

type GeminiStreamChunk = {
  error?: { message?: string }
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getToolCallNames(messages: Message[]): Map<string, string> {
  const names = new Map<string, string>()

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue
    }

    for (const toolCall of message.toolCalls ?? []) {
      names.set(toolCall.id, toolCall.actionId)
    }
  }

  return names
}

function toGeminiContents(messages: Message[]): GeminiContent[] {
  const toolCallNames = getToolCallNames(messages)

  return messages.flatMap((message): GeminiContent[] => {
    if (message.role === 'system') {
      return []
    }

    if (message.role === 'tool') {
      return [{
        role: 'user',
        parts: [{
          functionResponse: {
            name: message.toolName ?? toolCallNames.get(message.toolCallId) ?? message.toolCallId,
            response: { output: message.content },
          },
        }],
      }]
    }

    if (message.role === 'assistant') {
      return [{
        role: 'model',
        parts: message.content ? [{ text: message.content }] : [],
      }]
    }

    return [{ role: 'user', parts: [{ text: message.content }] }]
  }).filter((content) => content.parts.length > 0)
}

function toGeminiTools(actions: ActionDefinition[]): Array<{ functionDeclarations: GeminiFunctionDeclaration[] }> | undefined {
  if (actions.length === 0) {
    return undefined
  }

  return [{
    functionDeclarations: actions.map((action) => ({
      name: action.id,
      description: action.description,
      parameters: toGeminiSchema(action.inputSchema),
    })),
  }]
}

function toGeminiSchema(schema: unknown): Record<string, unknown> {
  const sanitized = sanitizeGeminiSchema(schema)

  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return { type: 'object' }
  }

  return sanitized as Record<string, unknown>
}

function sanitizeGeminiSchema(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeGeminiSchema)
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'additionalProperties' || key === '$schema' || key === '$id') {
      continue
    }

    sanitized[key] = sanitizeGeminiSchema(nestedValue)
  }

  return sanitized
}

function toProviderActionRequest(part: Extract<GeminiPart, { functionCall: unknown }>, index: number): ProviderActionRequest {
  const input = part.functionCall.args ?? {}

  if (!input || Array.isArray(input) || typeof input !== 'object') {
    throw new Error(`Function call arguments for ${part.functionCall.name} must be a JSON object`)
  }

  return {
    toolCallId: `gemini-tool-call-${index}`,
    actionId: part.functionCall.name,
    input: input as Record<string, JsonValue>,
  }
}

function getChunkErrorMessage(chunk: GeminiStreamChunk): string | null {
  return chunk.error?.message?.trim() ? chunk.error.message : null
}

async function readErrorResponse(response: Response): Promise<string> {
  const body = await response.text()

  if (!body.trim()) {
    return `${response.status} ${response.statusText}`.trim()
  }

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message?.trim() || body
  } catch {
    return body
  }
}

async function handleChunk(input: ProviderGenerateInput, chunk: GeminiStreamChunk, state: { message: string; actionCalls: ProviderActionRequest[] }): Promise<void> {
  const chunkErrorMessage = getChunkErrorMessage(chunk)

  if (chunkErrorMessage) {
    throw new Error(chunkErrorMessage)
  }

  for (const candidate of chunk.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if ('text' in part) {
        if (!part.text) {
          continue
        }

        state.message += part.text
        await input.onDelta?.(part.text)
        continue
      }

      if ('functionCall' in part) {
        state.actionCalls.push(toProviderActionRequest(part, state.actionCalls.length))
      }
    }
  }
}

export class GoogleGeminiProvider implements Provider {
  private readonly fetchImplementation: FetchLike

  constructor(options: GoogleGeminiProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? fetch
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    if (input.providerAuth.authMethod !== 'api-key' || !input.providerAuth.apiKey.trim()) {
      throw new Error('Add your Google AI Studio API key before starting a Google run.')
    }

    const baseUrl = input.settings.provider.baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta'
    const response = await this.fetchImplementation(
      `${normalizeBaseUrl(baseUrl)}/models/${encodeURIComponent(input.settings.provider.model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': input.providerAuth.apiKey.trim(),
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: createProviderInstructions({ workspaceRoot: input.settings.workspace.rootPath, role: input.run.role, skills: input.skills, memory: input.memory }) }],
          },
          contents: toGeminiContents(input.messages),
          tools: toGeminiTools(input.actions),
        }),
        signal: input.signal,
      },
    )

    if (!response.ok) {
      throw new Error(await readErrorResponse(response))
    }

    if (!response.body) {
      throw new Error('Provider returned an empty response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const state: { message: string; actionCalls: ProviderActionRequest[] } = { message: '', actionCalls: [] }
    let remainder = ''

    while (true) {
      const { done, value } = await reader.read()
      remainder += decoder.decode(value, { stream: !done })
      const { events, remainder: nextRemainder } = splitSseEvents(remainder)
      remainder = nextRemainder

      for (const eventText of events) {
        const data = parseSseData(eventText)

        if (!data || data === '[DONE]') {
          continue
        }

        await handleChunk(input, JSON.parse(data) as GeminiStreamChunk, state)
      }

      if (done) {
        break
      }
    }

    const trailingData = parseSseData(remainder)

    if (trailingData && trailingData !== '[DONE]') {
      await handleChunk(input, JSON.parse(trailingData) as GeminiStreamChunk, state)
    }

    return {
      content: state.message,
      actionCalls: state.actionCalls.length > 0 ? state.actionCalls : undefined,
    }
  }
}
