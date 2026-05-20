import { z } from 'zod'

export const specChangeStatusSchema = z.enum([
  'draft',
  'proposed',
  'planned',
  'building',
  'implemented',
  'verified',
  'archived',
  'blocked',
])

export type SpecChangeStatus = z.infer<typeof specChangeStatusSchema>

export const specArtifactKindSchema = z.enum([
  'proposal',
  'design',
  'tasks',
  'delta_spec',
  'evidence',
  'current_spec',
])

export type SpecArtifactKind = z.infer<typeof specArtifactKindSchema>

export const specTaskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'blocked'])

export type SpecTaskStatus = z.infer<typeof specTaskStatusSchema>

export const specTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: specTaskStatusSchema,
  ownerRole: z.enum(['plan', 'build', 'review']).optional(),
  validationNotes: z.array(z.string().min(1)).default([]),
  sourceLine: z.number().int().positive().optional(),
})

export type SpecTask = z.infer<typeof specTaskSchema>

export const specEvidenceLinkSchema = z.object({
  runIds: z.array(z.string().min(1)).default([]),
  eventIds: z.array(z.string().min(1)).default([]),
  approvalIds: z.array(z.string().min(1)).default([]),
  changedFiles: z.array(z.string().min(1)).default([]),
  validationOutputs: z.array(z.string().min(1)).default([]),
  benchmarkObservations: z.array(z.string().min(1)).default([]),
})

export type SpecEvidenceLink = z.infer<typeof specEvidenceLinkSchema>

export const specChangeSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: specChangeStatusSchema,
  path: z.string().min(1),
  taskCounts: z.object({
    total: z.number().int().nonnegative(),
    todo: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  updatedAt: z.iso.datetime(),
  linkedRunIds: z.array(z.string().min(1)).default([]),
})

export type SpecChangeSummary = z.infer<typeof specChangeSummarySchema>

export const specChangeDetailSchema = z.object({
  summary: specChangeSummarySchema,
  artifactPaths: z.array(z.object({
    kind: specArtifactKindSchema,
    path: z.string().min(1),
  })).default([]),
  tasks: z.array(specTaskSchema).default([]),
  evidenceLinks: specEvidenceLinkSchema.default({
    runIds: [],
    eventIds: [],
    approvalIds: [],
    changedFiles: [],
    validationOutputs: [],
    benchmarkObservations: [],
  }),
})

export type SpecChangeDetail = z.infer<typeof specChangeDetailSchema>

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
    'Create a durable Spec Workbench change for this task before any build work.',
    'Use Plan mode. First choose a concise kebab-case changeId. Create or update local artifacts under .nano/specs/changes/<changeId>/ using approval-gated write_spec_artifact calls:',
    '- proposal.md\n- design.md\n- tasks.md\n- evidence.json',
    'You may use create_spec_artifact to draft a bounded implementation spec, but it is non-mutating and not durable. Durable persistence must use write_spec_artifact and wait for approval.',
    'Do not edit application code during this proposal step. After artifacts are written, summarize the changeId and tell the user it is available in the Specs workbench.',
    task.trim(),
  ].join('\n\n')
}
