import { benchmarkRunSummarySchema, draftPrArtifactSchema, harnessChangeManifestSchema, harnessComponentRegistry, implementationSpecSchema, specEvidencePacketSchema } from '@nano-harness/shared'

import { createActionResult, type BuiltInActionCommand } from './types'

function parseHarnessChangeManifestInput(value: Record<string, unknown>) {
  return harnessChangeManifestSchema.parse(value.manifest)
}

function parseBenchmarkComparisonInput(value: Record<string, unknown>) {
  return {
    before: benchmarkRunSummarySchema.parse(value.before),
    after: benchmarkRunSummarySchema.parse(value.after),
  }
}

function parseCreateSpecInput(value: Record<string, unknown>): {
  task: string
  sourceType: 'local_text' | 'file_reference' | 'github_issue'
  constraints: string[]
  acceptanceCriteria: string[]
  validationPlan: string[]
} {
  if (typeof value.task !== 'string' || !value.task.trim()) {
    throw new Error('create_spec_artifact requires a non-empty task')
  }

  const sourceType = value.sourceType === 'file_reference' || value.sourceType === 'github_issue' ? value.sourceType : 'local_text'
  const constraints = Array.isArray(value.constraints) && value.constraints.every((item) => typeof item === 'string')
    ? value.constraints.filter((item) => item.trim())
    : ['Keep changes bounded to the described task.']
  const acceptanceCriteria = Array.isArray(value.acceptanceCriteria) && value.acceptanceCriteria.every((item) => typeof item === 'string')
    ? value.acceptanceCriteria.filter((item) => item.trim())
    : ['The implementation satisfies the requested behavior.']
  const validationPlan = Array.isArray(value.validationPlan) && value.validationPlan.every((item) => typeof item === 'string')
    ? value.validationPlan.filter((item) => item.trim())
    : ['pnpm test', 'pnpm typecheck', 'pnpm lint']

  return {
    task: value.task,
    sourceType,
    constraints: constraints.length ? constraints : ['Keep changes bounded to the described task.'],
    acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : ['The implementation satisfies the requested behavior.'],
    validationPlan: validationPlan.length ? validationPlan : ['pnpm test', 'pnpm typecheck', 'pnpm lint'],
  }
}

function parseDraftPrInput(value: Record<string, unknown>) {
  const spec = implementationSpecSchema.parse(value.spec)
  const changedFiles = Array.isArray(value.changedFiles) && value.changedFiles.every((item) => typeof item === 'string') ? value.changedFiles : []
  const validationOutputs = Array.isArray(value.validationOutputs) && value.validationOutputs.every((item) => typeof item === 'string') ? value.validationOutputs : []
  const evidenceLinks = Array.isArray(value.evidenceLinks) && value.evidenceLinks.every((item) => typeof item === 'string') ? value.evidenceLinks : [`spec:${spec.id}`]

  return { spec, changedFiles, validationOutputs, evidenceLinks }
}

function slugifyBranchName(value: string): string {
  return `spec/${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'task'}`
}

export const artifactActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
      id: 'list_harness_components',
      title: 'List Harness Components',
      description: 'List versioned Nano Harness components that may receive isolated improvement proposals',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    async execute(input) {
      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: harnessComponentRegistry,
      })
    },
  },
  {
    definition: {
      id: 'propose_harness_change',
      title: 'Propose Harness Change',
      description: 'Validate and return a reversible, evidence-backed harness change manifest without mutating live files',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          manifest: { type: 'object' },
        },
        required: ['manifest'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const manifest = parseHarnessChangeManifestInput(input.call.input)
      const registeredComponentIds = new Set(harnessComponentRegistry.components.map((component) => component.id))
      const unknownComponents = manifest.affectedComponents.filter((componentId) => !registeredComponentIds.has(componentId))

      if (unknownComponents.length > 0) {
        throw new Error(`Unknown harness components: ${unknownComponents.join(', ')}`)
      }

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          manifest,
          liveMutationApplied: false,
          approvalRequiredForPromotion: true,
        },
      })
    },
  },
  {
    definition: {
      id: 'compare_benchmark_results',
      title: 'Compare Benchmark Results',
      description: 'Compare before and after benchmark summaries to determine whether a harness proposal helped',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          before: { type: 'object' },
          after: { type: 'object' },
        },
        required: ['before', 'after'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseBenchmarkComparisonInput(input.call.input)
      const comparison = {
        before: parsedInput.before,
        after: parsedInput.after,
        passedDelta: parsedInput.after.passed - parsedInput.before.passed,
        failedDelta: parsedInput.after.failed - parsedInput.before.failed,
        scoreDelta: parsedInput.after.score - parsedInput.before.score,
        improved: parsedInput.after.score > parsedInput.before.score && parsedInput.after.failed <= parsedInput.before.failed,
      }

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: comparison,
      })
    },
  },
  {
    definition: {
      id: 'create_spec_artifact',
      title: 'Create Spec Artifact',
      description: 'Create a bounded implementation spec for a local task, file reference, or GitHub issue reference',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          sourceType: { type: 'string' },
          constraints: { type: 'array', items: { type: 'string' } },
          acceptanceCriteria: { type: 'array', items: { type: 'string' } },
          validationPlan: { type: 'array', items: { type: 'string' } },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseCreateSpecInput(input.call.input)
      const spec = implementationSpecSchema.parse({
        id: `spec-${input.call.id}`,
        source: { type: parsedInput.sourceType, value: parsedInput.task },
        problem: parsedInput.task,
        constraints: parsedInput.constraints,
        implementationPlan: [
          'Plan: inspect the relevant files and confirm constraints with read-only tools.',
          'Build: make the smallest focused patch after approval to proceed.',
          'Review: inspect the final diff against acceptance criteria and validation output.',
        ],
        validationPlan: parsedInput.validationPlan,
        risks: ['Scope creep beyond the bounded task.', 'Validation gaps if relevant tests are not identified.'],
        acceptanceCriteria: parsedInput.acceptanceCriteria,
        requiredRoles: ['plan', 'build', 'review'],
        branchName: slugifyBranchName(parsedInput.task),
        createdAt: new Date().toISOString(),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          spec,
          buildRequiresApproval: true,
          branchCreationRequiresApproval: true,
          remotePushRequiresApproval: true,
        },
      })
    },
  },
  {
    definition: {
      id: 'create_draft_pr_artifact',
      title: 'Create Draft PR Artifact',
      description: 'Create a local draft PR artifact and evidence packet without pushing to a remote',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          spec: { type: 'object' },
          changedFiles: { type: 'array', items: { type: 'string' } },
          validationOutputs: { type: 'array', items: { type: 'string' } },
          evidenceLinks: { type: 'array', items: { type: 'string' } },
        },
        required: ['spec'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseDraftPrInput(input.call.input)
      const draftPr = draftPrArtifactSchema.parse({
        title: parsedInput.spec.problem.slice(0, 72),
        summary: parsedInput.spec.implementationPlan,
        tests: parsedInput.validationOutputs.length ? parsedInput.validationOutputs : parsedInput.spec.validationPlan,
        risks: parsedInput.spec.risks,
        evidenceLinks: parsedInput.evidenceLinks,
        pushRequiresApproval: true,
        createdAt: new Date().toISOString(),
      })
      const evidencePacket = specEvidencePacketSchema.parse({
        spec: parsedInput.spec,
        draftPr,
        changedFiles: parsedInput.changedFiles,
        eventTraceRunIds: [input.run.id],
        approvalRequestIds: [],
        validationOutputs: parsedInput.validationOutputs,
        benchmarkObservations: [],
        createdAt: new Date().toISOString(),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          draftPr,
          evidencePacket,
          remotePushBlockedUntilApproval: true,
        },
      })
    },
  },
]
