import { z } from 'zod'

import { approvalRequestSchema, approvalResolutionSchema } from './approvals'
import { messageSchema } from './messages'
import { runEventSchema } from './events'
import { runSchema } from './runs'

export const sessionSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  parentSessionId: z.string().min(1).nullable(),
  rootSessionId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Session = z.infer<typeof sessionSchema>

export const sessionListSchema = z.array(sessionSchema)

export type SessionList = z.infer<typeof sessionListSchema>

export const sessionInputSchema = z.object({
  sessionId: z.string().min(1),
})

export type SessionInput = z.infer<typeof sessionInputSchema>

export const sessionExportSchema = z.object({
  session: sessionSchema,
  lineage: z.array(sessionSchema),
  runs: z.array(runSchema),
  messages: z.array(messageSchema),
  events: z.array(runEventSchema),
  approvals: z.object({
    requests: z.array(approvalRequestSchema),
    resolutions: z.array(approvalResolutionSchema),
  }),
})

export type SessionExport = z.infer<typeof sessionExportSchema>

export const sessionExportResultSchema = z.object({
  exportedFilePath: z.string().min(1),
})

export type SessionExportResult = z.infer<typeof sessionExportResultSchema>

export const sessionMutationResultSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().min(1),
})

export type SessionMutationResult = z.infer<typeof sessionMutationResultSchema>
