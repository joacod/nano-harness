import { z } from 'zod'

export const specSourceSchema = z.object({
  type: z.enum(['local_text', 'file_reference', 'github_issue']),
  value: z.string().min(1),
})

export type SpecSource = z.infer<typeof specSourceSchema>

export const implementationSpecSchema = z.object({
  id: z.string().min(1),
  source: specSourceSchema,
  problem: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
  implementationPlan: z.array(z.string().min(1)).min(1),
  validationPlan: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  requiredRoles: z.tuple([z.literal('plan'), z.literal('build'), z.literal('review')]),
  branchName: z.string().min(1),
  createdAt: z.iso.datetime(),
})

export type ImplementationSpec = z.infer<typeof implementationSpecSchema>

export const draftPrArtifactSchema = z.object({
  title: z.string().min(1),
  summary: z.array(z.string().min(1)).min(1),
  tests: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1),
  evidenceLinks: z.array(z.string().min(1)).min(1),
  pushRequiresApproval: z.literal(true),
  createdAt: z.iso.datetime(),
})

export type DraftPrArtifact = z.infer<typeof draftPrArtifactSchema>

export const specEvidencePacketSchema = z.object({
  spec: implementationSpecSchema,
  draftPr: draftPrArtifactSchema,
  changedFiles: z.array(z.string().min(1)),
  eventTraceRunIds: z.array(z.string().min(1)),
  approvalRequestIds: z.array(z.string().min(1)),
  validationOutputs: z.array(z.string().min(1)),
  benchmarkObservations: z.array(z.string().min(1)),
  createdAt: z.iso.datetime(),
})

export type SpecEvidencePacket = z.infer<typeof specEvidencePacketSchema>

export function createSpecWorkflowPrompt(task: string): string {
  return [
    'Create a bounded implementation spec for this task before any build work.',
    'Route the workflow through Plan, Build, and Review. Keep branch creation, push, and PR publication approval-gated.',
    task.trim(),
  ].join('\n\n')
}
