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

export const benchmarkComparisonSchema = z.object({
  before: benchmarkRunSummarySchema,
  after: benchmarkRunSummarySchema,
  passedDelta: z.number().int(),
  failedDelta: z.number().int(),
  scoreDelta: z.number(),
  improved: z.boolean(),
})

export type BenchmarkComparison = z.infer<typeof benchmarkComparisonSchema>

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
