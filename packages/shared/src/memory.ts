import { z } from 'zod'

export const memoryCategorySchema = z.enum([
  'preference',
  'project_fact',
  'workflow',
  'benchmark_observation',
  'skill_improvement',
  'harness_improvement_signal',
])

export type MemoryCategory = z.infer<typeof memoryCategorySchema>

export const memoryRecordSchema = z.object({
  id: z.string().min(1),
  category: memoryCategorySchema,
  content: z.string().min(1),
  source: z.string().min(1),
  runId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type MemoryRecord = z.infer<typeof memoryRecordSchema>

export const memoryProposalStatusSchema = z.enum(['pending', 'approved', 'rejected'])

export type MemoryProposalStatus = z.infer<typeof memoryProposalStatusSchema>

export const memoryProposalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  category: memoryCategorySchema,
  content: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  status: memoryProposalStatusSchema,
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().optional(),
})

export type MemoryProposal = z.infer<typeof memoryProposalSchema>

export const memorySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  enabledCategories: z.array(memoryCategorySchema).default([
    'preference',
    'project_fact',
    'workflow',
    'benchmark_observation',
    'skill_improvement',
    'harness_improvement_signal',
  ]),
  maxSnippets: z.number().int().min(0).max(12).default(5),
})

export type MemorySettings = z.infer<typeof memorySettingsSchema>

export const memoryRecallSchema = z.object({
  selected: z.array(memoryRecordSchema),
  excludedCategories: z.array(memoryCategorySchema),
})

export type MemoryRecall = z.infer<typeof memoryRecallSchema>

export const memoryProposalListSchema = z.object({
  proposals: z.array(memoryProposalSchema),
})

export type MemoryProposalList = z.infer<typeof memoryProposalListSchema>

export const memoryRecordListSchema = z.object({
  records: z.array(memoryRecordSchema),
})

export type MemoryRecordList = z.infer<typeof memoryRecordListSchema>

export const resolveMemoryProposalInputSchema = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(['approved', 'rejected']),
})

export type ResolveMemoryProposalInput = z.infer<typeof resolveMemoryProposalInputSchema>

export function createDefaultMemorySettings(): MemorySettings {
  return memorySettingsSchema.parse({})
}
