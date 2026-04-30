import { describe, expect, it, vi } from 'vitest'

import type { ActionDefinition, AppSettings, Message, Run } from '@nano-harness/shared'

import { OpenAICompatibleProvider } from '../src'

type FetchLike = typeof fetch

const run: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  createdAt: '2026-04-29T10:00:00.000Z',
}

const settings: AppSettings = {
  provider: {
    provider: 'openrouter',
    model: 'x-ai/grok-4.1-fast',
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
    reasoning: 'Need local file contents.',
    reasoningDetails: [{ type: 'reasoning.summary', summary: 'Inspecting workspace file.' }],
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

describe('OpenAICompatibleProvider', () => {
  it('sends the expected OpenAI-compatible request body', async () => {
    let capturedUrl: RequestInfo | URL | undefined
    let capturedInit: RequestInit | undefined

    const fetchMock = vi.fn<FetchLike>(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return createSseResponse(['data: [DONE]\n\n'])
    })
    const provider = new OpenAICompatibleProvider({ fetch: fetchMock })

    await provider.generate({
      run,
      messages,
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
      signal: new AbortController().signal,
    })

    expect(capturedUrl).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(capturedInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer api-key',
        }),
      }),
    )

    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'x-ai/grok-4.1-fast',
      stream: true,
      reasoning: {
        effort: 'medium',
        exclude: false,
      },
      parallel_tool_calls: false,
    })
    expect(body.messages).toMatchObject([
      { role: 'user', content: 'Read notes.txt' },
      {
        role: 'assistant',
        content: 'Calling the tool.',
        tool_calls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"notes.txt"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: '{"path":"notes.txt","content":"hello"}',
        tool_call_id: 'tool-call-1',
      },
    ])
  })

  it('supports llama.cpp-compatible local requests without an API key', async () => {
    let capturedUrl: RequestInfo | URL | undefined
    let capturedInit: RequestInit | undefined
    const fetchMock = vi.fn<FetchLike>(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return createSseResponse(['data: [DONE]\n\n'])
    })
    const provider = new OpenAICompatibleProvider({ fetch: fetchMock })

    await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings: {
        ...settings,
        provider: {
          provider: 'llama-cpp',
          model: 'local-model',
          baseUrl: 'http://127.0.0.1:8080/v1/',
        },
      },
      providerAuth: { authMethod: 'none' },
      signal: new AbortController().signal,
    })

    expect(capturedUrl).toBe('http://127.0.0.1:8080/v1/chat/completions')
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({
        'content-type': 'application/json',
      }),
    )
    expect(capturedInit?.headers).not.toEqual(expect.objectContaining({ authorization: expect.any(String) }))
  })

  it('streams content and reasoning deltas to the caller', async () => {
    const onDelta = vi.fn()
    const onReasoningDelta = vi.fn()
    const provider = new OpenAICompatibleProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({ choices: [{ delta: { content: 'Hello ' } }] }),
          toDataLine({ choices: [{ delta: { reasoning: 'step 1', reasoning_details: [{ type: 'reasoning.summary', summary: 'Thinking' }] } }] }),
          toDataLine({ choices: [{ delta: { content: 'world' } }] }),
          'data: [DONE]\n\n',
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
      signal: new AbortController().signal,
      onDelta,
      onReasoningDelta,
    })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hello ')
    expect(onDelta).toHaveBeenNthCalledWith(2, 'world')
    expect(onReasoningDelta).toHaveBeenCalledWith({
      text: 'step 1',
      details: [{ type: 'reasoning.summary', summary: 'Thinking' }],
    })
    expect(result).toMatchObject({
      content: 'Hello world',
      reasoning: 'step 1',
      reasoningDetails: [{ type: 'reasoning.summary', summary: 'Thinking' }],
    })
  })

  it('reassembles chunked tool call arguments from SSE events', async () => {
    const provider = new OpenAICompatibleProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'tool-call-1',
                      function: {
                        name: 'read_file',
                        arguments: '{"path":"',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          toDataLine({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: 'notes.txt"}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          'data: [DONE]\n\n',
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
      signal: new AbortController().signal,
    })

    expect(result.actionCalls).toEqual([
      {
        toolCallId: 'tool-call-1',
        actionId: 'read_file',
        input: { path: 'notes.txt' },
      },
    ])
  })

  it('surfaces HTTP error messages from error responses', async () => {
    const provider = new OpenAICompatibleProvider({
      fetch: vi.fn<FetchLike>(async () =>
        new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
          status: 429,
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
        providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('surfaces provider chunk errors from the stream', async () => {
    const provider = new OpenAICompatibleProvider({
      fetch: vi.fn<FetchLike>(async () => createSseResponse([toDataLine({ error: { message: 'Provider stream failed' } })])),
    })

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Provider stream failed')
  })

  it('handles trailing SSE data even without a final done event', async () => {
    const provider = new OpenAICompatibleProvider({
      fetch: vi.fn<FetchLike>(async () => createSseResponse([toDataLine({ choices: [{ delta: { content: 'Tail' } }] }).trimEnd()])),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'api-key' },
      signal: new AbortController().signal,
    })

    expect(result.content).toBe('Tail')
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
