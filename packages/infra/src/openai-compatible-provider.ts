import { getProviderDefinition, reasoningDetailSchema, type ActionDefinition, type AssistantToolCall, type JsonValue, type Message, type ProviderReasoningDelta, type ReasoningDetail } from '@nano-harness/shared'
import type { Provider, ProviderActionRequest, ProviderGenerateInput, ProviderGenerateResult } from '@nano-harness/core'

type FetchLike = typeof fetch

type OpenAICompatibleProviderOptions = {
  fetch?: FetchLike
}

type OpenAICompatibleMessage =
  | {
      role: 'system' | 'user'
      content: string
    }
  | {
      role: 'assistant'
      content: string | null
      reasoning?: string
      reasoning_details?: ReasoningDetail[]
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
      reasoning?: string | null
      reasoning_content?: string | null
      reasoning_details?: unknown[]
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

type OpenAICompatibleStreamDelta = NonNullable<NonNullable<OpenAICompatibleStreamChunk['choices']>[number]['delta']>

type PendingToolCall = {
  id?: string
  name: string
  argumentsText: string
}

type ReasoningAccumulator = {
  text: string
  details: ReasoningDetail[]
}

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
        reasoning: message.reasoning,
        reasoning_details: message.reasoningDetails,
        tool_calls: message.toolCalls?.length ? toOpenAICompatibleAssistantToolCalls(message.toolCalls) : undefined,
      }
    }

    return {
      role: message.role,
      content: message.content,
    }
  })
}

function toOpenAICompatibleReasoning(settings: ProviderGenerateInput['settings']): Record<string, unknown> | undefined {
  const reasoning = settings.provider.reasoning

  if (!reasoning || reasoning.mode === 'auto') {
    return undefined
  }

  if (reasoning.mode === 'off') {
    return { exclude: true }
  }

  return {
    effort: reasoning.effort,
    exclude: false,
  }
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

function parseReasoningDetails(details: unknown[] | undefined): ReasoningDetail[] {
  if (!details?.length) {
    return []
  }

  return details.flatMap((detail) => {
    const result = reasoningDetailSchema.safeParse(detail)
    return result.success
      ? [result.data]
      : [reasoningDetailSchema.parse({ type: 'reasoning.unknown', data: detail as JsonValue })]
  })
}

async function handleReasoningDelta(
  input: ProviderGenerateInput,
  accumulator: ReasoningAccumulator,
  delta: OpenAICompatibleStreamDelta | undefined,
): Promise<void> {
  const text = delta?.reasoning ?? delta?.reasoning_content ?? ''
  const details = parseReasoningDetails(delta?.reasoning_details)

  if (!text && details.length === 0) {
    return
  }

  accumulator.text += text
  accumulator.details = [...accumulator.details, ...details]

  const reasoningDelta: ProviderReasoningDelta = {}

  if (text) {
    reasoningDelta.text = text
  }

  if (details.length > 0) {
    reasoningDelta.details = details
  }

  await input.onReasoningDelta?.(reasoningDelta)
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

  constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? fetch
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    const providerDefinition = getProviderDefinition(input.settings.provider.provider)
    const baseUrl = input.settings.provider.baseUrl?.trim() || providerDefinition.baseUrl
    const apiKey = input.providerApiKey?.trim() ?? ''

    if (providerDefinition.requiresApiKey && !apiKey) {
      throw new Error(`Missing API key for ${providerDefinition.label}`)
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }

    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`
    }

    const response = await this.fetchImplementation(
      `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: input.settings.provider.model,
          stream: true,
          messages: toOpenAICompatibleMessages(input.messages),
          tools: toOpenAICompatibleTools(input.actions),
          reasoning: toOpenAICompatibleReasoning(input.settings),
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
    const reasoning: ReasoningAccumulator = { text: '', details: [] }
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
            reasoning: reasoning.text || undefined,
            reasoningDetails: reasoning.details.length > 0 ? reasoning.details : undefined,
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
          await handleReasoningDelta(input, reasoning, choice.delta)

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
        await handleReasoningDelta(input, reasoning, choice.delta)

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
      reasoning: reasoning.text || undefined,
      reasoningDetails: reasoning.details.length > 0 ? reasoning.details : undefined,
      actionCalls: pendingToolCalls.size > 0 ? toProviderActionRequests(pendingToolCalls) : undefined,
    }
  }
}
