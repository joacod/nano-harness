import { assistantToolCallSchema, messageSchema, reasoningDetailSchema, type Message } from '@nano-harness/shared'

import { parseJson, serializeJson } from './serializers'

export function serializeMessageMetadata(message: Message): string | null {
  if (message.role === 'assistant') {
    const metadata = {
      toolCalls: message.toolCalls && message.toolCalls.length > 0 ? message.toolCalls : undefined,
      reasoning: message.reasoning,
      reasoningDetails: message.reasoningDetails && message.reasoningDetails.length > 0 ? message.reasoningDetails : undefined,
    }

    return metadata.toolCalls || metadata.reasoning || metadata.reasoningDetails ? serializeJson(metadata) : null
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
      reasoning: typeof metadata?.['reasoning'] === 'string' ? metadata['reasoning'] : undefined,
      reasoningDetails: Array.isArray(metadata?.['reasoningDetails'])
        ? metadata?.['reasoningDetails'].map((detail) => reasoningDetailSchema.parse(detail))
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
