import type { ActionDefinition, AssistantToolCall, Message } from '@nano-harness/shared'
import type { Provider, ProviderActionRequest, ProviderGenerateInput, ProviderGenerateResult } from '@nano-harness/core'

type FetchLike = typeof fetch

type OpenAICompatibleProviderOptions = {
  fetch?: FetchLike
  defaultBaseUrl?: string
  resolveApiKey?: (envVar: string) => string | undefined
}

type OpenAICompatibleMessage =
  | {
      role: 'system' | 'user'
      content: string
    }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
          name: string
          arguments: string
        }
      }>
    }
  | {
      role: 'tool'
      content: string
      tool_call_id: string
    }

type OpenAICompatibleTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

type OpenAICompatibleStreamChunk = {
  error?: {
    message?: string
  }
  choices?: Array<{
    index?: number
    finish_reason?: string | null
    delta?: {
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
  }>
}

type PendingToolCall = {
  id?: string
  name: string
  argumentsText: string
}

const defaultBaseUrl = 'https://api.openai.com/v1'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function toOpenAICompatibleAssistantToolCalls(toolCalls: AssistantToolCall[]) {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    type: 'function' as const,
    function: {
      name: toolCall.actionId,
      arguments: JSON.stringify(toolCall.input),
    },
  }))
}

function toOpenAICompatibleMessages(messages: Message[]): OpenAICompatibleMessage[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      }
    }

    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls?.length ? toOpenAICompatibleAssistantToolCalls(message.toolCalls) : undefined,
      }
    }

    return {
      role: message.role,
      content: message.content,
    }
  })
}

function toOpenAICompatibleTools(actions: ActionDefinition[]): OpenAICompatibleTool[] {
  return actions.map((action) => ({
    type: 'function',
    function: {
      name: action.id,
      description: action.description,
      parameters: action.inputSchema,
    },
  }))
}

function splitSseEvents(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''

  return {
    events: parts,
    remainder,
  }
}

function parseSseData(eventText: string): string | null {
  const dataLines = eventText
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())

  if (dataLines.length === 0) {
    return null
  }

  return dataLines.join('\n')
}

function getChunkErrorMessage(chunk: OpenAICompatibleStreamChunk): string | null {
  return chunk.error?.message?.trim() ? chunk.error.message : null
}

function updatePendingToolCalls(
  pendingToolCalls: Map<number, PendingToolCall>,
  chunk: OpenAICompatibleStreamChunk,
): void {
  for (const choice of chunk.choices ?? []) {
    for (const toolCall of choice.delta?.tool_calls ?? []) {
      const index = toolCall.index ?? 0
      const existing = pendingToolCalls.get(index) ?? {
        id: toolCall.id,
        name: '',
        argumentsText: '',
      }

      pendingToolCalls.set(index, {
        id: toolCall.id ?? existing.id,
        name: toolCall.function?.name ?? existing.name,
        argumentsText: `${existing.argumentsText}${toolCall.function?.arguments ?? ''}`,
      })
    }
  }
}

function toProviderActionRequests(pendingToolCalls: Map<number, PendingToolCall>): ProviderActionRequest[] {
  return [...pendingToolCalls.entries()]
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([, toolCall]) => {
      if (!toolCall.id) {
        throw new Error('Received tool call without an id')
      }

      if (!toolCall.name) {
        throw new Error('Received tool call without a function name')
      }

      const parsedArguments = toolCall.argumentsText.trim()
        ? JSON.parse(toolCall.argumentsText)
        : {}

      if (!parsedArguments || Array.isArray(parsedArguments) || typeof parsedArguments !== 'object') {
        throw new Error(`Tool call arguments for ${toolCall.name} must be a JSON object`)
      }

      return {
        toolCallId: toolCall.id,
        actionId: toolCall.name,
        input: parsedArguments,
      }
    })
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

export class OpenAICompatibleProvider implements Provider {
  private readonly fetchImplementation: FetchLike
  private readonly defaultBaseUrl: string
  private readonly resolveApiKey: (envVar: string) => string | undefined

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? fetch
    this.defaultBaseUrl = normalizeBaseUrl(options.defaultBaseUrl ?? defaultBaseUrl)
    this.resolveApiKey = options.resolveApiKey ?? ((envVar) => process.env[envVar])
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    const apiKey = this.resolveApiKey(input.settings.provider.apiKeyEnvVar)

    if (!apiKey) {
      throw new Error(`Missing provider API key in environment variable ${input.settings.provider.apiKeyEnvVar}`)
    }

    const response = await this.fetchImplementation(
      `${normalizeBaseUrl(input.settings.provider.baseUrl ?? this.defaultBaseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: input.settings.provider.model,
          stream: true,
          messages: toOpenAICompatibleMessages(input.messages),
          tools: toOpenAICompatibleTools(input.actions),
          parallel_tool_calls: false,
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
    const pendingToolCalls = new Map<number, PendingToolCall>()
    let remainder = ''
    let message = ''

    while (true) {
      const { done, value } = await reader.read()

      remainder += decoder.decode(value, { stream: !done })

      const { events, remainder: nextRemainder } = splitSseEvents(remainder)
      remainder = nextRemainder

      for (const eventText of events) {
        const data = parseSseData(eventText)

        if (!data) {
          continue
        }

        if (data === '[DONE]') {
          return {
            content: message,
            actionCalls: pendingToolCalls.size > 0 ? toProviderActionRequests(pendingToolCalls) : undefined,
          }
        }

        const chunk = JSON.parse(data) as OpenAICompatibleStreamChunk
        const chunkErrorMessage = getChunkErrorMessage(chunk)

        if (chunkErrorMessage) {
          throw new Error(chunkErrorMessage)
        }

        updatePendingToolCalls(pendingToolCalls, chunk)

        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta?.content ?? ''

          if (!delta) {
            continue
          }

          message += delta
          await input.onDelta?.(delta)
        }
      }

      if (done) {
        break
      }
    }

    const trailingData = parseSseData(remainder)

    if (trailingData && trailingData !== '[DONE]') {
      const trailingChunk = JSON.parse(trailingData) as OpenAICompatibleStreamChunk
      const trailingErrorMessage = getChunkErrorMessage(trailingChunk)

      if (trailingErrorMessage) {
        throw new Error(trailingErrorMessage)
      }

      updatePendingToolCalls(pendingToolCalls, trailingChunk)

      for (const choice of trailingChunk.choices ?? []) {
        const delta = choice.delta?.content ?? ''

        if (!delta) {
          continue
        }

        message += delta
        await input.onDelta?.(delta)
      }
    }

    return {
      content: message,
      actionCalls: pendingToolCalls.size > 0 ? toProviderActionRequests(pendingToolCalls) : undefined,
    }
  }
}
