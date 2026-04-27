import { assistantToolCallSchema, messageSchema, type Message } from '@nano-harness/shared'

import { parseJson, serializeJson } from './serializers'

export function serializeMessageMetadata(message: Message): string | null {
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return serializeJson({
      toolCalls: message.toolCalls,
    })
  }

  if (message.role === 'tool') {
    return serializeJson({
      toolCallId: message.toolCallId,
      toolName: message.toolName,
    })
  }

  return null
}

export function deserializeMessage(row: {
  id: string
  conversationId: string
  runId?: string
  role: string
  content: string
  metadata?: string
  createdAt: string
}) {
  const metadata = row.metadata ? parseJson<Record<string, unknown>>(row.metadata) : undefined

  if (row.role === 'assistant') {
    return messageSchema.parse({
      id: row.id,
      conversationId: row.conversationId,
      runId: row.runId,
      role: 'assistant',
      content: row.content,
      toolCalls: Array.isArray(metadata?.['toolCalls'])
        ? metadata?.['toolCalls'].map((toolCall) => assistantToolCallSchema.parse(toolCall))
        : undefined,
      createdAt: row.createdAt,
    })
  }

  if (row.role === 'tool') {
    return messageSchema.parse({
      id: row.id,
      conversationId: row.conversationId,
      runId: row.runId,
      role: 'tool',
      content: row.content,
      toolCallId: typeof metadata?.['toolCallId'] === 'string' ? metadata['toolCallId'] : '',
      toolName: typeof metadata?.['toolName'] === 'string' ? metadata['toolName'] : undefined,
      createdAt: row.createdAt,
    })
  }

  return messageSchema.parse({
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  })
}
