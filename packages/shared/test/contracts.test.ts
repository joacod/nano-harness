import { describe, expect, it } from 'vitest'

import {
  appSettingsSchema,
  clearProviderAuthInputSchema,
  getProviderDefinition,
  messageSchema,
  openExternalUrlInputSchema,
  providerOptions,
  resolveApprovalInputSchema,
  saveProviderAuthInputSchema,
  startProviderOauthResultSchema,
  runEventSchema,
  startProviderOauthInputSchema,
} from '../src'

describe('shared contracts', () => {
  it('keeps the default provider definition stable', () => {
    expect(getProviderDefinition('openrouter')).toMatchObject({
      key: 'openrouter',
      label: 'OpenRouter',
      adapterId: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'x-ai/grok-4.1-fast',
      requiresApiKey: true,
      authMethods: ['api-key'],
      defaultAuthMethod: 'api-key',
    })

    expect(getProviderDefinition('llama-cpp')).toMatchObject({
      key: 'llama-cpp',
      label: 'llama.cpp',
      adapterId: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      defaultModel: 'ggml-org/gemma-3-1b-it-GGUF',
      requiresApiKey: false,
      authMethods: ['none'],
      defaultAuthMethod: 'none',
    })

    expect(getProviderDefinition('openai')).toMatchObject({
      key: 'openai',
      label: 'OpenAI',
      adapterId: 'chatgpt-subscription',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      defaultModel: 'gpt-5.2',
      requiresApiKey: false,
      authMethods: ['oauth'],
      defaultAuthMethod: 'oauth',
    })
  })

  it('includes OpenAI in provider options', () => {
    expect(providerOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'openai',
          label: 'OpenAI',
          defaultModel: 'gpt-5.2',
        }),
      ]),
    )
  })

  it('parses assistant and tool messages with tool metadata', () => {
    expect(
      messageSchema.parse({
        id: 'assistant-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        role: 'assistant',
        content: 'I will read the file first.',
        toolCalls: [
          {
            id: 'tool-call-1',
            actionId: 'read_file',
            input: { path: 'notes.txt' },
          },
        ],
        reasoning: 'Need file contents before answering.',
        reasoningDetails: [
          {
            type: 'reasoning.summary',
            summary: 'Checking local workspace context.',
          },
        ],
        createdAt: '2026-04-29T10:00:00.000Z',
      }),
    ).toMatchObject({
      role: 'assistant',
      toolCalls: [{ actionId: 'read_file' }],
    })

    expect(
      messageSchema.parse({
        id: 'tool-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        role: 'tool',
        content: '{"path":"notes.txt"}',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        createdAt: '2026-04-29T10:00:01.000Z',
      }),
    ).toMatchObject({
      role: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
    })
  })

  it('rejects approval event payloads whose resolution type does not match the event', () => {
    expect(() =>
      runEventSchema.parse({
        id: 'event-1',
        runId: 'run-1',
        timestamp: '2026-04-29T10:00:00.000Z',
        type: 'approval.granted',
        payload: {
          resolution: {
            approvalRequestId: 'approval-1',
            decision: 'rejected',
            decidedAt: '2026-04-29T10:00:00.000Z',
          },
        },
      }),
    ).toThrow('approval.granted must carry a granted resolution')
  })

  it('validates bridge payloads for approval resolution and external urls', () => {
    expect(
      resolveApprovalInputSchema.parse({
        runId: 'run-1',
        approvalRequestId: 'approval-1',
        decision: 'granted',
      }),
    ).toMatchObject({ decision: 'granted' })

    expect(openExternalUrlInputSchema.parse({ url: 'https://example.com/docs' })).toMatchObject({
      url: 'https://example.com/docs',
    })

    expect(() => openExternalUrlInputSchema.parse({ url: 'not a url' })).toThrow()
  })

  it('validates OAuth bridge payloads', () => {
    expect(startProviderOauthInputSchema.parse({ provider: 'openai' })).toEqual({ provider: 'openai' })
    expect(startProviderOauthInputSchema.parse({ provider: 'openai', authMethod: 'oauth' })).toEqual({ provider: 'openai', authMethod: 'oauth' })
    expect(startProviderOauthResultSchema.parse({ provider: 'openai', accountId: 'account-1' })).toEqual({ provider: 'openai', accountId: 'account-1' })
    expect(saveProviderAuthInputSchema.parse({ provider: 'openrouter', authMethod: 'api-key', apiKey: 'key' })).toEqual({
      provider: 'openrouter',
      authMethod: 'api-key',
      apiKey: 'key',
    })
    expect(clearProviderAuthInputSchema.parse({ provider: 'openai', authMethod: 'oauth' })).toEqual({ provider: 'openai', authMethod: 'oauth' })
    expect(() => startProviderOauthInputSchema.parse({ provider: 'not-a-provider' })).toThrow()
    expect(() => saveProviderAuthInputSchema.parse({ provider: 'openai', authMethod: 'oauth', apiKey: 'key' })).toThrow()
  })

  it('rejects invalid app settings payloads', () => {
    expect(() =>
      appSettingsSchema.parse({
        provider: {
          provider: 'openrouter',
          model: '',
        },
        workspace: {
          rootPath: '',
          approvalPolicy: 'sometimes',
        },
      }),
    ).toThrow()
  })
})
