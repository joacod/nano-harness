import { describe, expect, it, vi } from 'vitest'

import { providerDefaultModels, type ActionDefinition, type AppSettings, type Message, type Run } from '@nano-harness/shared'
import { createProviderInstructions } from '@nano-harness/core'

import { GoogleGeminiProvider } from '../src'

type FetchLike = typeof fetch

const run: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  role: 'build',
  createdAt: '2026-04-29T10:00:00.000Z',
}

const settings: AppSettings = {
  provider: {
    provider: 'google',
    model: providerDefaultModels.google,
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

describe('GoogleGeminiProvider', () => {
  it('sends the expected Gemini request body', async () => {
    let capturedUrl: RequestInfo | URL | undefined
    let capturedInit: RequestInit | undefined
    const fetchMock = vi.fn<FetchLike>(async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return createSseResponse([toDataLine({ candidates: [] })])
    })
    const provider = new GoogleGeminiProvider({ fetch: fetchMock })

    await provider.generate({
      run,
      messages,
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: ' google-key ' },
      signal: new AbortController().signal,
    })

    expect(capturedUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse')
    expect(capturedInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-goog-api-key': 'google-key',
        }),
      }),
    )

    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body.systemInstruction).toEqual({
      parts: [{ text: createProviderInstructions({ workspaceRoot: '/workspace', role: 'build' }) }],
    })
    expect(body.contents).toMatchObject([
      { role: 'user', parts: [{ text: 'Read notes.txt' }] },
      {
        role: 'model',
        parts: [{ text: 'Calling the tool.' }],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'read_file', response: { output: '{"path":"notes.txt","content":"hello"}' } } }],
      },
    ])
    expect(body.tools).toMatchObject([
      {
        functionDeclarations: [
          {
            name: 'read_file',
            description: 'Read a file from disk',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        ],
      },
    ])
    expect(JSON.stringify(body.tools)).not.toContain('additionalProperties')
    expect(JSON.stringify(body.contents)).not.toContain('functionCall')
  })

  it('streams content deltas to the caller', async () => {
    const onDelta = vi.fn()
    const provider = new GoogleGeminiProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({ candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] }),
          toDataLine({ candidates: [{ content: { parts: [{ text: 'world' }] } }] }),
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions: [],
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'google-key' },
      signal: new AbortController().signal,
      onDelta,
    })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hello ')
    expect(onDelta).toHaveBeenNthCalledWith(2, 'world')
    expect(result.content).toBe('Hello world')
  })

  it('ignores empty text deltas', async () => {
    const onDelta = vi.fn()
    const provider = new GoogleGeminiProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({ candidates: [{ content: { parts: [{ text: '' }, { text: 'Hello' }] } }] }),
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions: [],
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'google-key' },
      signal: new AbortController().signal,
      onDelta,
    })

    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta).toHaveBeenCalledWith('Hello')
    expect(result.content).toBe('Hello')
  })

  it('parses Gemini function calls', async () => {
    const provider = new GoogleGeminiProvider({
      fetch: vi.fn<FetchLike>(async () =>
        createSseResponse([
          toDataLine({ candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'notes.txt' } } }] } }] }),
        ]),
      ),
    })

    const result = await provider.generate({
      run,
      messages: [messages[0]],
      actions,
      settings,
      providerAuth: { authMethod: 'api-key', apiKey: 'google-key' },
      signal: new AbortController().signal,
    })

    expect(result.actionCalls).toEqual([
      {
        toolCallId: 'gemini-tool-call-0',
        actionId: 'read_file',
        input: { path: 'notes.txt' },
      },
    ])
  })

  it('throws when API key auth is missing', async () => {
    const provider = new GoogleGeminiProvider()

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: { authMethod: 'none' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Add your Google AI Studio API key before starting a Google run.')
  })

  it('surfaces Gemini error messages', async () => {
    const provider = new GoogleGeminiProvider({
      fetch: vi.fn<FetchLike>(async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 400 }),
      ),
    })

    await expect(
      provider.generate({
        run,
        messages: [messages[0]],
        actions,
        settings,
        providerAuth: { authMethod: 'api-key', apiKey: 'bad-key' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Invalid API key')
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
