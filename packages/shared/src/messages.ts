import { z } from 'zod'

export const messageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])

export type MessageRole = z.infer<typeof messageRoleSchema>

export const messageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  runId: z.string().min(1).optional(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
})

export type Message = z.infer<typeof messageSchema>

export const conversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Conversation = z.infer<typeof conversationSchema>
