import { z } from 'zod'

export const harnessComponentKindSchema = z.enum(['prompt', 'tool_description', 'skill', 'middleware_setting', 'action_implementation'])

export type HarnessComponentKind = z.infer<typeof harnessComponentKindSchema>

export const harnessComponentSchema = z.object({
  id: z.string().min(1),
  kind: harnessComponentKindSchema,
  title: z.string().min(1),
  version: z.string().min(1),
  path: z.string().min(1),
  mutable: z.boolean(),
})

export type HarnessComponent = z.infer<typeof harnessComponentSchema>

export const harnessChangeManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  rootCause: z.string().min(1),
  proposedFix: z.string().min(1),
  predictedEffect: z.string().min(1),
  affectedComponents: z.array(z.string().min(1)).min(1),
  evidence: z.array(z.string().min(1)).min(1),
  benchmarkSuites: z.array(z.string().min(1)).min(1),
  tests: z.array(z.string().min(1)).min(1),
  rollbackPlan: z.string().min(1),
  patchPreview: z.string().min(1),
  createdAt: z.iso.datetime(),
})

export type HarnessChangeManifest = z.infer<typeof harnessChangeManifestSchema>

export const benchmarkRunSummarySchema = z.object({
  suite: z.string().min(1),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  score: z.number().min(0).max(1),
})

export type BenchmarkRunSummary = z.infer<typeof benchmarkRunSummarySchema>

export const benchmarkCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  path: z.string().min(1),
})

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>

export const benchmarkRunPlanCaseSchema = benchmarkCaseSchema.extend({
  goal: z.string().min(1).optional(),
  setup: z.array(z.string().min(1)).default([]),
  prompt: z.string().min(1).optional(),
  expectedCapabilities: z.array(z.string().min(1)).default([]),
  successCriteria: z.array(z.string().min(1)).default([]),
  scoringNotes: z.array(z.string().min(1)).default([]),
})

export type BenchmarkRunPlanCase = z.infer<typeof benchmarkRunPlanCaseSchema>

export const benchmarkRunPlanArtifactSchema = z.object({
  id: z.string().min(1),
  suite: z.string().min(1),
  cases: z.array(benchmarkRunPlanCaseSchema).min(1),
  unknownCaseIds: z.array(z.string().min(1)),
  resultTemplate: z.array(z.object({
    caseId: z.string().min(1),
    status: z.enum(['passed', 'failed']).nullable(),
    notes: z.string().min(1).optional(),
    evidence: z.array(z.string().min(1)).default([]),
  })),
  outputPath: z.string().min(1),
  approvalRequiredForWrite: z.literal(false),
  liveMutationApplied: z.literal(false),
  createdAt: z.iso.datetime(),
})

export type BenchmarkRunPlanArtifact = z.infer<typeof benchmarkRunPlanArtifactSchema>

export const benchmarkCaseResultSchema = z.object({
  caseId: z.string().min(1),
  status: z.enum(['passed', 'failed']),
  notes: z.string().min(1).optional(),
  evidence: z.array(z.string().min(1)).default([]),
})

export type BenchmarkCaseResult = z.infer<typeof benchmarkCaseResultSchema>

export const benchmarkRunArtifactSchema = z.object({
  id: z.string().min(1),
  suite: z.string().min(1),
  cases: z.array(benchmarkCaseSchema).min(1),
  results: z.array(benchmarkCaseResultSchema).min(1),
  summary: benchmarkRunSummarySchema,
  unknownCaseIds: z.array(z.string().min(1)),
  missingCaseIds: z.array(z.string().min(1)),
  evidence: z.array(z.string().min(1)),
  outputPath: z.string().min(1),
  approvalRequiredForWrite: z.literal(true),
  liveMutationApplied: z.literal(false),
  createdAt: z.iso.datetime(),
})

export type BenchmarkRunArtifact = z.infer<typeof benchmarkRunArtifactSchema>

export const benchmarkComparisonSchema = z.object({
  before: benchmarkRunSummarySchema,
  after: benchmarkRunSummarySchema,
  passedDelta: z.number().int(),
  failedDelta: z.number().int(),
  scoreDelta: z.number(),
  improved: z.boolean(),
})

export type BenchmarkComparison = z.infer<typeof benchmarkComparisonSchema>

export const harnessPromotionArtifactSchema = z.object({
  manifest: harnessChangeManifestSchema,
  benchmarkComparison: benchmarkComparisonSchema,
  promotionReady: z.boolean(),
  blockers: z.array(z.string().min(1)),
  approvalRequiredForPromotion: z.literal(true),
  liveMutationApplied: z.literal(false),
  createdAt: z.iso.datetime(),
})

export type HarnessPromotionArtifact = z.infer<typeof harnessPromotionArtifactSchema>

export const harnessComponentRegistrySchema = z.object({
  components: z.array(harnessComponentSchema),
})

export type HarnessComponentRegistry = z.infer<typeof harnessComponentRegistrySchema>

export const harnessComponentRegistry = harnessComponentRegistrySchema.parse({
  components: [
    {
      id: 'core.instructions',
      kind: 'prompt',
      title: 'Provider Instructions',
      version: '1.0.0',
      path: 'packages/core/src/instructions.ts',
      mutable: true,
    },
    {
      id: 'infra.built_in_actions',
      kind: 'action_implementation',
      title: 'Built-in Actions',
      version: '1.0.0',
      path: 'packages/infra/src/built-in-actions.ts',
      mutable: true,
    },
    {
      id: 'shared.safety_settings',
      kind: 'middleware_setting',
      title: 'Safety Settings',
      version: '1.0.0',
      path: 'packages/shared/src/safety.ts',
      mutable: true,
    },
    {
      id: 'skills.bundled',
      kind: 'skill',
      title: 'Bundled Skills',
      version: '1.0.0',
      path: 'packages/infra/src/skills-loader.ts',
      mutable: true,
    },
  ],
})

export const benchmarkCaseRegistry = z.object({
  cases: z.array(benchmarkCaseSchema),
}).parse({
  cases: [
    { id: 'approval-pause-resume', title: 'Approval Pause Resume', path: 'benchmarks/cases/approval-pause-resume.md' },
    { id: 'edit-and-test', title: 'Edit And Test', path: 'benchmarks/cases/edit-and-test.md' },
    { id: 'multi-turn-recall', title: 'Multi Turn Recall', path: 'benchmarks/cases/multi-turn-recall.md' },
    { id: 'recovery', title: 'Recovery', path: 'benchmarks/cases/recovery.md' },
    { id: 'repo-survey', title: 'Repo Survey', path: 'benchmarks/cases/repo-survey.md' },
    { id: 'spec-workbench', title: 'Spec Workbench', path: 'benchmarks/cases/spec-workbench.md' },
    { id: 'validation-obligations', title: 'Validation Obligations', path: 'benchmarks/cases/validation-obligations.md' },
  ],
})
