import { benchmarkRunSummarySchema, draftPrArtifactSchema, harnessChangeManifestSchema, harnessComponentRegistry, implementationSpecSchema, skillImprovementArtifactSchema, specArtifactKindSchema, specEvidencePacketSchema, specTaskStatusSchema, type SpecArtifactKind } from '@nano-harness/shared'

import { SpecWorkspaceService } from '../spec-workspace'

import { createActionResult, type BuiltInActionCommand } from './types'

const specWorkspaceService = new SpecWorkspaceService()

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

function parseSkillImprovementInput(value: Record<string, unknown>): {
  title: string
  mode: 'create' | 'update'
  targetSkillId?: string
  rationale: string
  evidence: string[]
  skillName: string
  description: string
  triggers: string[]
  tools: string[]
  safetyNotes: string[]
  body: string
} {
  const mode = value.mode === 'update' ? 'update' : 'create'
  const title = parseString(value.title, 'title')
  const targetSkillId = parseOptionalString(value.targetSkillId, 'targetSkillId')
  const rationale = parseString(value.rationale, 'rationale')
  const evidence = parseStringArray(value.evidence, 'evidence') ?? []
  const skillName = parseString(value.skillName, 'skillName')
  const description = parseString(value.description, 'description')
  const triggers = parseStringArray(value.triggers, 'triggers') ?? []
  const tools = parseStringArray(value.tools, 'tools') ?? []
  const safetyNotes = parseStringArray(value.safetyNotes, 'safetyNotes') ?? []
  const body = parseString(value.body, 'body')

  if (mode === 'update' && !targetSkillId) {
    throw new Error('targetSkillId is required when updating a skill')
  }

  if (evidence.length === 0) {
    throw new Error('evidence must include at least one evidence link')
  }

  return { title, mode, targetSkillId, rationale, evidence, skillName, description, triggers, tools, safetyNotes, body }
}

function parseBoolean(value: unknown): boolean {
  return value === true
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value
}

function parseStringContent(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  return value
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return parseString(value, fieldName)
}

function parseStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`${fieldName} must be an array of non-empty strings`)
  }

  return value
}

function parseArtifactKind(value: unknown): SpecArtifactKind {
  return specArtifactKindSchema.parse(value)
}

function slugifyBranchName(value: string): string {
  return `spec/${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'task'}`
}

function slugifySkillId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill'
}

function renderSkillMarkdown(input: {
  skillName: string
  description: string
  triggers: string[]
  tools: string[]
  safetyNotes: string[]
  body: string
}): string {
  return [
    '---',
    `name: ${input.skillName}`,
    `description: ${input.description}`,
    `triggers: ${input.triggers.join(', ')}`,
    `tools: ${input.tools.join(', ')}`,
    `safety: ${input.safetyNotes.join(', ')}`,
    '---',
    '',
    input.body.trim(),
    '',
  ].join('\n')
}

export const artifactActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
      id: 'list_spec_changes',
      title: 'List Spec Changes',
      description: 'List local Spec Workbench changes from .nano/specs inside the configured workspace',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          includeArchived: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    async execute(input) {
      const changes = await specWorkspaceService.listChanges(input.settings.workspace.rootPath, {
        includeArchived: parseBoolean(input.call.input.includeArchived),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: { changes },
      })
    },
  },
  {
    definition: {
      id: 'read_spec_artifact',
      title: 'Read Spec Artifact',
      description: 'Read a local spec artifact from .nano/specs inside the configured workspace',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
          artifactKind: { type: 'string' },
          relativePath: { type: 'string' },
        },
        required: ['artifactKind'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const artifact = await specWorkspaceService.readArtifact(input.settings.workspace.rootPath, {
        changeId: parseOptionalString(input.call.input.changeId, 'changeId'),
        kind: parseArtifactKind(input.call.input.artifactKind),
        relativePath: parseOptionalString(input.call.input.relativePath, 'relativePath'),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: artifact,
      })
    },
  },
  {
    definition: {
      id: 'write_spec_artifact',
      title: 'Write Spec Artifact',
      description: 'Write a local spec artifact under .nano/specs after approval',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
          artifactKind: { type: 'string' },
          relativePath: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['artifactKind', 'content'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const artifactKind = parseArtifactKind(input.call.input.artifactKind)
      const result = await specWorkspaceService.writeArtifact(input.settings.workspace.rootPath, {
        changeId: parseOptionalString(input.call.input.changeId, 'changeId'),
        kind: artifactKind,
        relativePath: parseOptionalString(input.call.input.relativePath, 'relativePath'),
        content: parseStringContent(input.call.input.content, 'content'),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          ...result,
          artifactKind,
          ...(input.call.input.changeId === undefined ? {} : { changeId: parseString(input.call.input.changeId, 'changeId') }),
        },
      })
    },
  },
  {
    definition: {
      id: 'update_spec_task',
      title: 'Update Spec Task',
      description: 'Update one markdown task checkbox in a local spec change after approval',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
          taskId: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['changeId', 'taskId', 'status'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const result = await specWorkspaceService.updateTask(input.settings.workspace.rootPath, {
        changeId: parseString(input.call.input.changeId, 'changeId'),
        taskId: parseString(input.call.input.taskId, 'taskId'),
        status: specTaskStatusSchema.parse(input.call.input.status),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: result,
      })
    },
  },
  {
    definition: {
      id: 'append_spec_evidence',
      title: 'Append Spec Evidence',
      description: 'Append run, approval, changed-file, validation, or benchmark evidence to a local spec change after approval',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
          runs: { type: 'array', items: { type: 'string' } },
          approvals: { type: 'array', items: { type: 'string' } },
          changedFiles: { type: 'array', items: { type: 'string' } },
          validation: { type: 'array', items: { type: 'string' } },
          benchmarkObservations: { type: 'array', items: { type: 'string' } },
        },
        required: ['changeId'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const evidence = await specWorkspaceService.appendEvidence(input.settings.workspace.rootPath, {
        changeId: parseString(input.call.input.changeId, 'changeId'),
        runs: parseStringArray(input.call.input.runs, 'runs'),
        approvals: parseStringArray(input.call.input.approvals, 'approvals'),
        changedFiles: parseStringArray(input.call.input.changedFiles, 'changedFiles'),
        validation: parseStringArray(input.call.input.validation, 'validation'),
        benchmarkObservations: parseStringArray(input.call.input.benchmarkObservations, 'benchmarkObservations'),
        updatedAt: new Date().toISOString(),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: evidence,
      })
    },
  },
  {
    definition: {
      id: 'archive_spec_change',
      title: 'Archive Spec Change',
      description: 'Move a local spec change from .nano/specs/changes to .nano/specs/archive after approval',
      requiresApproval: true,
      inputSchema: {
        type: 'object',
        properties: {
          changeId: { type: 'string' },
        },
        required: ['changeId'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const archivedPath = await specWorkspaceService.archiveChange(input.settings.workspace.rootPath, parseString(input.call.input.changeId, 'changeId'))

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          changeId: parseString(input.call.input.changeId, 'changeId'),
          archivedPath,
        },
      })
    },
  },
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
      id: 'create_skill_improvement_artifact',
      title: 'Create Skill Improvement Artifact',
      description: 'Create a draft skill patch or new skill folder proposal without mutating live skill files',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          mode: { type: 'string' },
          targetSkillId: { type: 'string' },
          rationale: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          skillName: { type: 'string' },
          description: { type: 'string' },
          triggers: { type: 'array', items: { type: 'string' } },
          tools: { type: 'array', items: { type: 'string' } },
          safetyNotes: { type: 'array', items: { type: 'string' } },
          body: { type: 'string' },
        },
        required: ['title', 'rationale', 'evidence', 'skillName', 'description', 'body'],
        additionalProperties: false,
      },
    },
    async execute(input) {
      const parsedInput = parseSkillImprovementInput(input.call.input)
      const skillId = parsedInput.targetSkillId ?? slugifySkillId(parsedInput.skillName)
      const relativePath = `.nano/skills/${skillId}/SKILL.md`
      const content = renderSkillMarkdown(parsedInput)
      const artifact = skillImprovementArtifactSchema.parse({
        id: `skill-improvement-${input.call.id}`,
        mode: parsedInput.mode,
        targetSkillId: parsedInput.targetSkillId,
        title: parsedInput.title,
        rationale: parsedInput.rationale,
        evidence: parsedInput.evidence,
        proposedFiles: [{ relativePath, content }],
        patchPreview: [
          `diff --git a/${relativePath} b/${relativePath}`,
          parsedInput.mode === 'create' ? 'new file mode 100644' : `--- a/${relativePath}`,
          `+++ b/${relativePath}`,
          '@@ proposed SKILL.md @@',
          content,
        ].join('\n'),
        approvalRequiredForWrite: true,
        createdAt: new Date().toISOString(),
      })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          artifact,
          liveMutationApplied: false,
          approvalRequiredForWrite: true,
        },
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
