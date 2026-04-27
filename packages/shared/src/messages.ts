import { z } from 'zod'

import { jsonValueSchema } from './actions'
import { reasoningDetailSchema } from './reasoning'

export const messageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])

export type MessageRole = z.infer<typeof messageRoleSchema>

const messageBaseSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  runId: z.string().min(1).optional(),
  content: z.string(),
  createdAt: z.string().datetime(),
})

export const assistantToolCallSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
  input: z.record(z.string(), jsonValueSchema),
})

export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>

export const systemMessageSchema = messageBaseSchema.extend({
  role: z.literal('system'),
})

export const userMessageSchema = messageBaseSchema.extend({
  role: z.literal('user'),
})

export const assistantMessageSchema = messageBaseSchema.extend({
  role: z.literal('assistant'),
  toolCalls: z.array(assistantToolCallSchema).optional(),
  reasoning: z.string().optional(),
  reasoningDetails: z.array(reasoningDetailSchema).optional(),
})

export const toolMessageSchema = messageBaseSchema.extend({
  role: z.literal('tool'),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1).optional(),
})

export const messageSchema = z.discriminatedUnion('role', [
  systemMessageSchema,
  userMessageSchema,
  assistantMessageSchema,
  toolMessageSchema,
])

export type Message = z.infer<typeof messageSchema>

export const conversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Conversation = z.infer<typeof conversationSchema>
