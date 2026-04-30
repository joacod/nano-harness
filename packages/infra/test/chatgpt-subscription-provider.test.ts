import { describe, expect, it, vi } from 'vitest'

import { providerDefaultModels, type ActionDefinition, type AppSettings, type Message, type Run } from '@nano-harness/shared'

import { ChatGptSubscriptionProvider } from '../src'

type FetchLike = typeof fetch

const run: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  createdAt: '2026-04-29T10:00:00.000Z',
}

const settings: AppSettings = {
  provider: {
    provider: 'openai',
    model: providerDefaultModels.openai,
    reasoning: {
      mode: 'effort',
      effort: 'medium',
    },
  },
  workspace: {
    rootPath: '/workspace',
    approvalPolicy: 'on-request',
  },
}

const actions: ActionDefinition[] = [
  {
    id: 'read_file',
    title: 'Read File',
    description: 'Read a file from disk',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
]

const messages: Message[] = [
  {
    id: 'message-1',
    conversationId: 'conversation-1',
    runId: 'run-1',
    role: 'user',
    content: 'Read notes.txt',
    createdAt: '2026-04-29T10:00:00.000Z',
  },
  {
    id: 'message-2',
    conversationId: 'conversation-1',
    runId: 'run-1',
    role: 'assistant',
    content: 'Calling the tool.',
    toolCalls: [
      {
        id: 'tool-call-1',
        actionId: 'read_file',
        input: { path: 'notes.txt' },
      },
    ],
    createdAt: '2026-04-29T10:00:01.000Z',
  },
  {
    id: 'message-3',
    conversationId: 'conversation-1',
    runId: 'run-1',
    role: 'tool',
    content: '{"path":"notes.txt","content":"hello"}',
    toolCallId: 'tool-call-1',
    createdAt: '2026-04-29T10:00:02.000Z',
  },
]

describe('ChatGptSubscriptionProvider', () => {
  it('sends auth headers and a Responses-style body', async () => {
    let capturedUrl: RequestInfo | URL | undefined
    let capturedInit: RequestInit | undefined
    const provider = new ChatGptSubscriptionProvider({
      fetch: vi.fn<FetchLike>(async (url, init) => {
        capturedUrl = url
        capturedInit = init
        return createSseResponse(['data: [DONE]\n\n'])
      }),
    })

    await provider.generate({
      run,
      messages,
      actions,
      settings,
      providerAuth: {
        authMethod: 'oauth',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
        accountId: 'account-1',
      },
      signal: new AbortController().signal,
    })

    expect(capturedUrl).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(capturedInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer access-token',
          'ChatGPT-Account-Id': 'account-1',
        }),
      }),
    )

    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: providerDefaultModels.openai,
      instructions: expect.stringContaining('Nano Harness'),
      store: false,
      stream: true,
      reasoning: { effort: 'medium' },
      parallel_tool_calls: false,
    })
    expect(body.input).toMatchObject([
      { role: 'user', content: [{ type: 'input_text', text: 'Read notes.txt' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'Calling the tool.' }] },
      {
        type: 'function_call',
        call_id: 'tool-call-1',
        name: 'read_file',
        arguments: '{"path":"notes.txt"}',
      },
      {
        type: 'function_call_output',
        call_id: 'tool-call-1',
        output: '{"path":"notes.txt","content":"hello"}',
      },
    ])
    expect(body.tools).toMatchObject([
      {
        type: 'function',
        name: 'read_file',
        description: 'Read a file from disk',
      },
    ])
  })

  it('streams text deltas to the caller', async () => {
    const onDelta = vi.fn()
    const provider = new ChatGptSubscriptionProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({ type: 'response.output_text.delta', delta: 'Hello ' }),
          toDataLine({ type: 'response.output_text.delta', delta: 'world' }),
          toDataLine({ type: 'response.completed' }),
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: {
        authMethod: 'oauth',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
      },
      signal: new AbortController().signal,
      onDelta,
    })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hello ')
    expect(onDelta).toHaveBeenNthCalledWith(2, 'world')
    expect(result.content).toBe('Hello world')
  })

  it('parses streamed function calls into action calls', async () => {
    const provider = new ChatGptSubscriptionProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({
            type: 'response.output_item.added',
            item: { id: 'item-1', type: 'function_call', call_id: 'call-1', name: 'read_file' },
          }),
          toDataLine({ type: 'response.function_call_arguments.delta', item_id: 'item-1', delta: '{"path":"' }),
          toDataLine({ type: 'response.function_call_arguments.delta', item_id: 'item-1', delta: 'notes.txt"}' }),
          toDataLine({ type: 'response.completed' }),
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: {
        authMethod: 'oauth',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
      },
      signal: new AbortController().signal,
    })

    expect(result.actionCalls).toEqual([
      {
        toolCallId: 'call-1',
        actionId: 'read_file',
        input: { path: 'notes.txt' },
      },
    ])
  })

  it('throws when OAuth auth is missing', async () => {
    const provider = new ChatGptSubscriptionProvider()

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: { authMethod: 'none' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Sign in with ChatGPT before starting an OpenAI run.')
  })

  it('surfaces stream errors', async () => {
    const provider = new ChatGptSubscriptionProvider({
      fetch: vi.fn<FetchLike>(async () => createSseResponse([toDataLine({ error: { message: 'Provider failed' } })])),
    })

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: {
          authMethod: 'oauth',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 60_000,
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Provider failed')
  })

  it('surfaces ChatGPT detail errors from HTTP responses', async () => {
    const provider = new ChatGptSubscriptionProvider({
      fetch: vi.fn<FetchLike>(async () =>
        new Response(JSON.stringify({ detail: 'Instructions are required' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    })

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: {
          authMethod: 'oauth',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 60_000,
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Instructions are required')
  })
})

function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }

        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  )
}

function toDataLine(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}
