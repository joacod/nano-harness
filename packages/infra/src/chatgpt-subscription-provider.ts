import type { ActionDefinition, AssistantToolCall, Message } from '@nano-harness/shared'
import type { Provider, ProviderActionRequest, ProviderGenerateInput, ProviderGenerateResult } from '@nano-harness/core'

type FetchLike = typeof fetch

type ChatGptSubscriptionProviderOptions = {
  fetch?: FetchLike
}

type ResponsesInputItem =
  | { role: 'user'; content: Array<{ type: 'input_text'; text: string }> }
  | { role: 'assistant'; content: Array<{ type: 'output_text'; text: string }> }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

type ResponsesTool = {
  type: 'function'
  name: string
  description?: string
  parameters: Record<string, unknown>
}

type ResponsesStreamEvent = {
  type?: string
  delta?: string
  output_text?: string
  error?: { message?: string } | string
  item?: {
    id?: string
    type?: string
    call_id?: string
    name?: string
    arguments?: string
  }
  call_id?: string
  name?: string
  arguments?: string
  arguments_delta?: string
  index?: number
  output_index?: number
  item_id?: string
}

type PendingFunctionCall = {
  callId?: string
  name?: string
  argumentsText: string
}

const CHATGPT_CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CHATGPT_CODEX_INSTRUCTIONS = 'You are Nano Harness, a local desktop coding assistant. Help the user complete their request using the available tools when needed.'

function toResponsesToolCalls(toolCalls: AssistantToolCall[]): ResponsesInputItem[] {
  return toolCalls.map((toolCall) => ({
    type: 'function_call',
    call_id: toolCall.id,
    name: toolCall.actionId,
    arguments: JSON.stringify(toolCall.input),
  }))
}

function toResponsesInput(messages: Message[]): ResponsesInputItem[] {
  return messages.flatMap((message) => {
    if (message.role === 'tool') {
      return [{ type: 'function_call_output', call_id: message.toolCallId, output: message.content }]
    }

    if (message.role === 'assistant') {
      return [
        ...(message.content ? [{ role: 'assistant' as const, content: [{ type: 'output_text' as const, text: message.content }] }] : []),
        ...(message.toolCalls?.length ? toResponsesToolCalls(message.toolCalls) : []),
      ]
    }

    return [{ role: 'user', content: [{ type: 'input_text', text: message.content }] }]
  })
}

function toResponsesTools(actions: ActionDefinition[]): ResponsesTool[] {
  return actions.map((action) => ({
    type: 'function',
    name: action.id,
    description: action.description,
    parameters: action.inputSchema,
  }))
}

function toResponsesReasoning(settings: ProviderGenerateInput['settings']): Record<string, unknown> | undefined {
  const reasoning = settings.provider.reasoning

  if (!reasoning || reasoning.mode === 'auto' || reasoning.mode === 'off') {
    return undefined
  }

  return { effort: reasoning.effort }
}

function splitSseEvents(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''

  return { events: parts, remainder }
}

function parseSseData(eventText: string): string | null {
  const dataLines = eventText
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())

  return dataLines.length ? dataLines.join('\n') : null
}

function getStreamErrorMessage(event: ResponsesStreamEvent): string | null {
  if (typeof event.error === 'string' && event.error.trim()) {
    return event.error
  }

  if (event.error && typeof event.error === 'object' && event.error.message?.trim()) {
    return event.error.message
  }

  if (event.type === 'response.failed') {
    return 'ChatGPT subscription provider returned a failed response.'
  }

  return null
}

function getFunctionCallKey(event: ResponsesStreamEvent): string {
  return event.item_id ?? event.item?.id ?? event.call_id ?? String(event.output_index ?? event.index ?? 0)
}

function updatePendingFunctionCalls(pendingFunctionCalls: Map<string, PendingFunctionCall>, event: ResponsesStreamEvent): void {
  const eventType = event.type ?? ''

  if (!eventType.includes('function_call') && event.item?.type !== 'function_call') {
    return
  }

  const key = getFunctionCallKey(event)
  const existing = pendingFunctionCalls.get(key) ?? { argumentsText: '' }
  const item = event.item
  const nextArguments = event.delta ?? event.arguments_delta ?? event.arguments ?? item?.arguments ?? ''

  pendingFunctionCalls.set(key, {
    callId: event.call_id ?? item?.call_id ?? existing.callId,
    name: event.name ?? item?.name ?? existing.name,
    argumentsText: `${existing.argumentsText}${nextArguments}`,
  })
}

function toProviderActionRequests(pendingFunctionCalls: Map<string, PendingFunctionCall>): ProviderActionRequest[] {
  return [...pendingFunctionCalls.values()].map((functionCall) => {
    if (!functionCall.callId) {
      throw new Error('Received function call without a call id')
    }

    if (!functionCall.name) {
      throw new Error('Received function call without a name')
    }

    const parsedInput = functionCall.argumentsText.trim() ? JSON.parse(functionCall.argumentsText) : {}

    if (!parsedInput || Array.isArray(parsedInput) || typeof parsedInput !== 'object') {
      throw new Error(`Function call arguments for ${functionCall.name} must be a JSON object`)
    }

    return {
      toolCallId: functionCall.callId,
      actionId: functionCall.name,
      input: parsedInput,
    }
  })
}

async function readErrorResponse(response: Response): Promise<string> {
  const body = await response.text()

  if (!body.trim()) {
    return `${response.status} ${response.statusText}`.trim()
  }

  try {
    const parsed = JSON.parse(body) as { detail?: string; error?: { message?: string } }
    return parsed.error?.message?.trim() || parsed.detail?.trim() || body
  } catch {
    return body
  }
}

export class ChatGptSubscriptionProvider implements Provider {
  private readonly fetchImplementation: FetchLike

  constructor(options: ChatGptSubscriptionProviderOptions = {}) {
    this.fetchImplementation = options.fetch ?? fetch
  }

  async generate(input: ProviderGenerateInput): Promise<ProviderGenerateResult> {
    if (input.providerAuth.authMethod !== 'oauth') {
      throw new Error('Sign in with ChatGPT before starting an OpenAI run.')
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${input.providerAuth.accessToken}`,
    }

    if (input.providerAuth.accountId) {
      headers['ChatGPT-Account-Id'] = input.providerAuth.accountId
    }

    const response = await this.fetchImplementation(CHATGPT_CODEX_RESPONSES_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.settings.provider.model,
        instructions: CHATGPT_CODEX_INSTRUCTIONS,
        store: false,
        stream: true,
        input: toResponsesInput(input.messages),
        tools: toResponsesTools(input.actions),
        reasoning: toResponsesReasoning(input.settings),
        parallel_tool_calls: false,
      }),
      signal: input.signal,
    })

    if (!response.ok) {
      throw new Error(await readErrorResponse(response))
    }

    if (!response.body) {
      throw new Error('Provider returned an empty response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const pendingFunctionCalls = new Map<string, PendingFunctionCall>()
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
            actionCalls: pendingFunctionCalls.size ? toProviderActionRequests(pendingFunctionCalls) : undefined,
          }
        }

        const event = JSON.parse(data) as ResponsesStreamEvent
        const errorMessage = getStreamErrorMessage(event)

        if (errorMessage) {
          throw new Error(errorMessage)
        }

        updatePendingFunctionCalls(pendingFunctionCalls, event)

        if (event.type === 'response.output_text.delta' && event.delta) {
          message += event.delta
          await input.onDelta?.(event.delta)
        }

        if (event.type === 'response.completed') {
          return {
            content: message,
            actionCalls: pendingFunctionCalls.size ? toProviderActionRequests(pendingFunctionCalls) : undefined,
          }
        }
      }

      if (done) {
        break
      }
    }

    const trailingData = parseSseData(remainder)

    if (trailingData && trailingData !== '[DONE]') {
      const event = JSON.parse(trailingData) as ResponsesStreamEvent
      const errorMessage = getStreamErrorMessage(event)

      if (errorMessage) {
        throw new Error(errorMessage)
      }

      updatePendingFunctionCalls(pendingFunctionCalls, event)

      if (event.type === 'response.output_text.delta' && event.delta) {
        message += event.delta
        await input.onDelta?.(event.delta)
      }
    }

    return {
      content: message,
      actionCalls: pendingFunctionCalls.size ? toProviderActionRequests(pendingFunctionCalls) : undefined,
    }
  }
}
