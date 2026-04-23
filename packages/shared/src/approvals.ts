import { z } from 'zod'

export const approvalDecisionSchema = z.enum(['granted', 'rejected'])

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>

export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  actionCallId: z.string().min(1),
  reason: z.string().min(1),
  requestedAt: z.string().datetime(),
})

export type ApprovalRequest = z.infer<typeof approvalRequestSchema>

export const approvalResolutionSchema = z.object({
  approvalRequestId: z.string().min(1),
  decision: approvalDecisionSchema,
  decidedAt: z.string().datetime(),
})

export type ApprovalResolution = z.infer<typeof approvalResolutionSchema>
