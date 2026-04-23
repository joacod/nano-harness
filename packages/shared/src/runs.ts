import { z } from 'zod'

export const runStatusSchema = z.enum([
  'created',
  'started',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
])

export type RunStatus = z.infer<typeof runStatusSchema>

export const runSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  status: runStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  failureMessage: z.string().min(1).optional(),
})

export type Run = z.infer<typeof runSchema>

export const runCreateInputSchema = z.object({
  conversationId: z.string().min(1),
  prompt: z.string().min(1),
})

export type RunCreateInput = z.infer<typeof runCreateInputSchema>

export const runStatusTransitions = {
  created: ['started', 'cancelled'],
  started: ['waiting_approval', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['started', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<RunStatus, readonly RunStatus[]>
