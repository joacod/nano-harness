import { spawn } from 'node:child_process'
import path from 'node:path'

import { normalizeWorkspaceRelativePath, type ActionExecutionInput, type ActionExecutor } from '@nano-harness/core'
import { benchmarkRunSummarySchema, draftPrArtifactSchema, harnessChangeManifestSchema, harnessComponentRegistry, implementationSpecSchema, specEvidencePacketSchema } from '@nano-harness/shared'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

import { fileActionCommands } from './actions/file-actions'
import { networkActionCommands } from './actions/network-actions'
import { searchActionCommands } from './actions/search-actions'
import { createActionResult, type BuiltInActionCommand } from './actions/types'
import { resolveWorkspacePath } from './actions/workspace'

function parseRunCommandInput(value: Record<string, unknown>): { command: string; args: string[]; cwd: string; timeoutMs: number } {
  if (typeof value.command !== 'string' || !value.command.trim()) {
    throw new Error('run_command requires a non-empty string command')
  }

  const args = Array.isArray(value.args) ? value.args : []
  const cwd = typeof value.cwd === 'string' && value.cwd.trim() ? value.cwd : '.'
  const timeoutMs = typeof value.timeoutMs === 'number' ? value.timeoutMs : 120000

  if (!args.every((item) => typeof item === 'string')) {
    throw new Error('run_command args must be an array of strings')
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new Error('run_command timeoutMs must be an integer between 1000 and 300000')
  }

  return { command: value.command, args, cwd, timeoutMs }
}

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

const actionDefinitions: Record<string, ActionDefinition> = {
  ...Object.fromEntries(fileActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(searchActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(networkActionCommands.map((command) => [command.definition.id, command.definition])),
  run_command: {
    id: 'run_command',
    title: 'Run Command',
    description: 'Run an allow-listed local command in the configured workspace with bounded output',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  git_status: {
    id: 'git_status',
    title: 'Git Status',
    description: 'Inspect git working tree status without modifying the repository',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  git_diff: {
    id: 'git_diff',
    title: 'Git Diff',
    description: 'Inspect git diff without modifying the repository',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  list_harness_components: {
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
  propose_harness_change: {
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
  compare_benchmark_results: {
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
  create_spec_artifact: {
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
  create_draft_pr_artifact: {
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
} satisfies Record<string, ActionDefinition>

const allowedCommands = new Set(['pnpm', 'npm', 'node', 'git', 'tsc', 'vitest', 'ls', 'pwd'])

function ensureAllowedCommand(command: string): void {
  if (command.includes('/') || command.includes('\\') || !allowedCommands.has(command)) {
    throw new Error(`Command ${command} is not in the allow-list`)
  }
}

async function runProcess(input: {
  command: string
  args: string[]
  cwd: string
  timeoutMs: number
  signal: AbortSignal
}): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: input.signal,
    })
    const chunks: Buffer[] = []
    const errorChunks: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, input.timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errorChunks.push(chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      resolve({
        exitCode,
        stdout: Buffer.concat(chunks).toString('utf8').slice(0, 20000),
        stderr: Buffer.concat(errorChunks).toString('utf8').slice(0, 20000),
        timedOut,
      })
    })
  })
}

const commandRegistry = new Map<string, BuiltInActionCommand>([...fileActionCommands, ...searchActionCommands, ...networkActionCommands].map((command) => [command.definition.id, command]))

export class BuiltInActionExecutor implements ActionExecutor {
  async listDefinitions(): Promise<ActionDefinition[]> {
    return builtInActionDefinitions
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    return actionDefinitions[actionId] ?? null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    try {
      const command = commandRegistry.get(input.action.id)

      if (command) {
        return await command.execute(input)
      }

      switch (input.action.id) {
        case 'run_command': {
          const parsedInput = parseRunCommandInput(input.call.input)
          ensureAllowedCommand(parsedInput.command)
          const workspaceCwd = normalizeWorkspaceRelativePath(parsedInput.cwd)
          const cwd = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.cwd)
          const result = await runProcess({ ...parsedInput, cwd, signal: input.signal })
          const status = result.exitCode === 0 && !result.timedOut ? 'completed' : 'failed'

          return createActionResult({
            actionCallId: input.call.id,
            status,
            errorMessage: status === 'failed' ? `Command exited with ${result.timedOut ? 'timeout' : result.exitCode}` : undefined,
            output: {
              command: parsedInput.command,
              args: parsedInput.args,
              cwd: workspaceCwd,
              exitCode: result.exitCode,
              timedOut: result.timedOut,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          })
        }
        case 'git_status': {
          const result = await runProcess({
            command: 'git',
            args: ['status', '--short'],
            cwd: path.resolve(input.settings.workspace.rootPath),
            timeoutMs: 30000,
            signal: input.signal,
          })

          return createActionResult({
            actionCallId: input.call.id,
            status: result.exitCode === 0 ? 'completed' : 'failed',
            errorMessage: result.exitCode === 0 ? undefined : `git status exited with ${result.exitCode}`,
            output: result,
          })
        }
        case 'git_diff': {
          const staged = input.call.input.staged === true
          const result = await runProcess({
            command: 'git',
            args: staged ? ['diff', '--staged'] : ['diff'],
            cwd: path.resolve(input.settings.workspace.rootPath),
            timeoutMs: 30000,
            signal: input.signal,
          })

          return createActionResult({
            actionCallId: input.call.id,
            status: result.exitCode === 0 ? 'completed' : 'failed',
            errorMessage: result.exitCode === 0 ? undefined : `git diff exited with ${result.exitCode}`,
            output: { ...result, staged },
          })
        }
        case 'list_harness_components': {
          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: harnessComponentRegistry,
          })
        }
        case 'propose_harness_change': {
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
        }
        case 'compare_benchmark_results': {
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
        }
        case 'create_spec_artifact': {
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
        }
        case 'create_draft_pr_artifact': {
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
        }
        default:
          return createActionResult({
            actionCallId: input.call.id,
            status: 'failed',
            errorMessage: `Unsupported action ${input.action.id}`,
          })
      }
    } catch (error) {
      return createActionResult({
        actionCallId: input.call.id,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown action failure',
      })
    }
  }
}

export const builtInActionDefinitions = Object.values(actionDefinitions)
