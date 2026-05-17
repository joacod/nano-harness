import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActionExecutionInput } from '@nano-harness/core'
import { createDefaultProviderSettings, type ActionDefinition, type AppSettings, type JsonValue, type Run } from '@nano-harness/shared'

import { BuiltInActionExecutor } from '../src'

const testRun: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'started',
  role: 'build',
  createdAt: '2026-04-29T10:00:00.000Z',
}

const workspaceSettings: AppSettings = {
  provider: createDefaultProviderSettings('openrouter'),
  workspace: {
    rootPath: '',
    approvalPolicy: 'on-request',
  },
}

const cleanupPaths: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()

  await Promise.all(
    cleanupPaths.splice(0).map(async (cleanupPath) => {
      await rm(cleanupPath, { recursive: true, force: true })
    }),
  )
})

describe('BuiltInActionExecutor', () => {
  it('lists files and directories inside the configured workspace', async () => {
    const rootPath = await createWorkspace()
    await mkdir(path.join(rootPath, 'farmagora'))
    await writeFile(path.join(rootPath, 'README.md'), 'root readme', 'utf8')

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'list_directory',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: '.' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        path: '.',
        entries: [
          { name: 'farmagora', type: 'directory', path: 'farmagora' },
          { name: 'README.md', type: 'file', path: 'README.md' },
        ],
      },
    })
  })

  it('reads a utf-8 file inside the configured workspace', async () => {
    const rootPath = await createWorkspace()
    const notePath = path.join(rootPath, 'notes.txt')
    await writeFile(notePath, 'hello from the workspace', 'utf8')

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'read_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'notes.txt' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        path: 'notes.txt',
        content: 'hello from the workspace',
      },
    })
  })

  it('accepts backslash-separated relative tool paths and returns slash-normalized paths', async () => {
    const rootPath = await createWorkspace()
    await mkdir(path.join(rootPath, 'src'))
    await writeFile(path.join(rootPath, 'src', 'notes.txt'), 'hello from nested notes', 'utf8')

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'read_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'src\\notes.txt' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        path: 'src/notes.txt',
        content: 'hello from nested notes',
      },
    })
  })

  it('reads a bounded line range with line numbers', async () => {
    const rootPath = await createWorkspace()
    await writeFile(path.join(rootPath, 'notes.txt'), 'one\ntwo\nthree\nfour', 'utf8')

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'read_range',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'notes.txt', startLine: 2, maxLines: 2 },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        path: 'notes.txt',
        startLine: 2,
        endLine: 3,
        content: '2: two\n3: three',
      },
    })
  })

  it('finds files with glob and searches files with grep', async () => {
    const rootPath = await createWorkspace()
    await mkdir(path.join(rootPath, 'src'))
    await writeFile(path.join(rootPath, 'src', 'main.ts'), 'export const answer = 42\n', 'utf8')
    await writeFile(path.join(rootPath, 'README.md'), 'answer docs\n', 'utf8')

    const globResult = await createExecutor().execute(
      createExecutionInput({
        actionId: 'glob',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { pattern: '**/*.ts' },
      }),
    )
    const grepResult = await createExecutor().execute(
      createExecutionInput({
        actionId: 'grep',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { pattern: 'answer', include: '**/*.ts' },
      }),
    )

    expect(globResult).toMatchObject({ status: 'completed', output: { matches: ['src/main.ts'] } })
    expect(grepResult).toMatchObject({
      status: 'completed',
      output: {
        matches: [{ path: 'src/main.ts', line: 1, text: 'export const answer = 42' }],
      },
    })
  })

  it('applies exact text patches without rewriting through write_file', async () => {
    const rootPath = await createWorkspace()
    await writeFile(path.join(rootPath, 'notes.txt'), 'hello old world', 'utf8')

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'apply_patch',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'notes.txt', oldText: 'old', newText: 'new' },
      }),
    )

    expect(result).toMatchObject({ status: 'completed', output: { path: 'notes.txt' } })
    await expect(readFile(path.join(rootPath, 'notes.txt'), 'utf8')).resolves.toBe('hello new world')
  })

  it('writes a file, creates parent directories, and reports bytes written', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'write_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'nested/output.txt', content: 'hello' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        path: 'nested/output.txt',
        bytesWritten: 5,
      },
    })
    await expect(readFile(path.join(rootPath, 'nested/output.txt'), 'utf8')).resolves.toBe('hello')
  })

  it('rejects workspace traversal outside the configured root', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'read_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: '../outside.txt' },
      }),
    )

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'Path ../outside.txt is outside the configured workspace root',
    })
  })

  it('rejects Windows drive-absolute paths instead of resolving them under the workspace', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'read_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'C:\\Users\\someone\\secret.txt' },
      }),
    )

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'Path C:\\Users\\someone\\secret.txt is outside the configured workspace root',
    })
  })

  it('fails invalid action input payloads with clear validation errors', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'write_file',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { path: 'a.txt', content: 42 },
      }),
    )

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'write_file requires string content',
    })
  })

  it('fetches urls successfully and truncates long response bodies', async () => {
    const rootPath = await createWorkspace()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('x'.repeat(13000), {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    )

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'fetch_url',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { url: 'https://example.com/docs' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        url: 'https://example.com/docs',
        status: 200,
        contentType: 'text/plain',
      },
    })

    if (!result.output || Array.isArray(result.output) || typeof result.output !== 'object' || result.output.body === undefined) {
      throw new Error('Expected fetch_url to return an object output with body')
    }

    expect(typeof result.output.body).toBe('string')
    expect(result.output.body).toHaveLength(12000)
  })

  it('returns failed fetch results with status details', async () => {
    const rootPath = await createWorkspace()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('Nope', {
          status: 404,
          statusText: 'Not Found',
        }),
      ),
    )

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'fetch_url',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { url: 'https://example.com/missing' },
      }),
    )

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'Fetch failed with 404 Not Found',
      output: {
        url: 'https://example.com/missing',
        status: 404,
        body: 'Nope',
      },
    })
  })

  it('rejects unsupported url protocols', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'fetch_url',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { url: 'file:///tmp/secret.txt' },
      }),
    )

    expect(result).toMatchObject({
      status: 'failed',
      errorMessage: 'fetch_url only supports http and https URLs',
    })
  })

  it('returns current time for a requested IANA time zone without shell access', async () => {
    const rootPath = await createWorkspace()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-13T21:30:00.000Z'))

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'get_current_time',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { timeZone: 'America/New_York', locale: 'en-US' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        nowIso: '2026-05-13T21:30:00.000Z',
        timeZone: 'America/New_York',
        locale: 'en-US',
      },
    })

    if (!result.output || Array.isArray(result.output) || typeof result.output !== 'object') {
      throw new Error('Expected get_current_time to return an object output')
    }

    expect(result.output.formatted).toContain('2026')
  })

  it('runs only allow-listed commands without shell expansion', async () => {
    const rootPath = await createWorkspace()

    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'run_command',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { command: 'node', args: ['--version'] },
      }),
    )

    expect(result).toMatchObject({ status: 'completed' })

    const deniedResult = await createExecutor().execute(
      createExecutionInput({
        actionId: 'run_command',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: { command: 'rm', args: ['-rf', '.'] },
      }),
    )

    expect(deniedResult).toMatchObject({
      status: 'failed',
      errorMessage: 'Command rm is not in the allow-list',
    })
  })

  it('validates harness manifests and compares benchmark results without live mutation', async () => {
    const rootPath = await createWorkspace()
    await writeBenchmarkCase(rootPath, 'spec-workbench', [
      '# Spec Workbench',
      '',
      '## Goal',
      'Create and drive one local spec change through the visible Spec Workbench flow.',
      '',
      '## Prompt',
      'Create a spec for adding a small renderer affordance, plan it, build one selected task, review the result, and export run evidence.',
      '',
      '## Success Criteria',
      '- The Spec Workbench shows exactly one active change for the benchmark task.',
    ].join('\n'))
    await writeBenchmarkCase(rootPath, 'validation-obligations', [
      '# Validation Obligations',
      '',
      '## Goal',
      'Verify that local edits create explicit validation obligations and that subsequent validation evidence is inspectable.',
      '',
      '## Success Criteria',
      '- The run timeline shows obligation.created after the edit action completes.',
    ].join('\n'))
    const executor = createExecutor()
    const componentsResult = await executor.execute(
      createExecutionInput({
        actionId: 'list_harness_components',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {},
      }),
    )
    const proposalResult = await executor.execute(
      createExecutionInput({
        actionId: 'propose_harness_change',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          manifest: {
            id: 'change-1',
            title: 'Tighten provider instructions',
            rootCause: 'Benchmark evidence shows missing validation reminders.',
            proposedFix: 'Add a concise validation reminder to build mode.',
            predictedEffect: 'More runs will validate edits before completion.',
            affectedComponents: ['core.instructions'],
            evidence: ['benchmark local-edit failed validation'],
            benchmarkSuites: ['benchmarks/cases/local-edit.json'],
            tests: ['pnpm test'],
            rollbackPlan: 'Revert the instruction text change in packages/core/src/instructions.ts.',
            patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
            createdAt: '2026-04-29T10:00:00.000Z',
          },
        },
      }),
    )
    const comparisonResult = await executor.execute(
      createExecutionInput({
        actionId: 'compare_benchmark_results',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          before: { suite: 'local', passed: 2, failed: 1, score: 0.66 },
          after: { suite: 'local', passed: 3, failed: 0, score: 1 },
        },
      }),
    )
    const benchmarkPlanResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_benchmark_run_plan',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          suite: 'local',
          caseIds: ['spec-workbench', 'validation-obligations', 'missing-case'],
        },
      }),
    )
    const benchmarkArtifactResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_benchmark_run_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          suite: 'local',
          results: [
            { caseId: 'edit-and-test', status: 'passed', evidence: ['run:run-1'] },
            { caseId: 'validation-obligations', status: 'failed', notes: 'Missing evidence export.' },
          ],
          evidence: ['session export: local'],
        },
      }),
    )
    const writeBenchmarkArtifactResult = await executor.execute(
      createExecutionInput({
        actionId: 'write_benchmark_run_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          artifact: expectActionOutput(benchmarkArtifactResult.output),
        },
      }),
    )
    await writeFile(path.join(rootPath, 'benchmarks/results/broken.json'), '{not-json', 'utf8')
    const benchmarkResultsResult = await executor.execute(
      createExecutionInput({
        actionId: 'list_benchmark_results',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {},
      }),
    )
    const promotionResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_harness_promotion_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          manifest: {
            id: 'change-1',
            title: 'Tighten provider instructions',
            rootCause: 'Benchmark evidence shows missing validation reminders.',
            proposedFix: 'Add a concise validation reminder to build mode.',
            predictedEffect: 'More runs will validate edits before completion.',
            affectedComponents: ['core.instructions'],
            evidence: ['benchmark local-edit failed validation'],
            benchmarkSuites: ['local'],
            tests: ['pnpm test'],
            rollbackPlan: 'Revert the instruction text change in packages/core/src/instructions.ts.',
            patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
            createdAt: '2026-04-29T10:00:00.000Z',
          },
          benchmarkComparison: {
            before: { suite: 'local', passed: 2, failed: 1, score: 0.66 },
            after: { suite: 'local', passed: 3, failed: 0, score: 1 },
            passedDelta: 1,
            failedDelta: -1,
            scoreDelta: 0.33999999999999997,
            improved: true,
          },
        },
      }),
    )

    expect(componentsResult).toMatchObject({ status: 'completed' })
    expect(componentsResult.output).toMatchObject({
      components: expect.arrayContaining([expect.objectContaining({ id: 'core.instructions' })]),
    })
    expect(proposalResult).toMatchObject({
      status: 'completed',
      output: { liveMutationApplied: false, approvalRequiredForPromotion: true },
    })
    expect(comparisonResult).toMatchObject({
      status: 'completed',
      output: { passedDelta: 1, failedDelta: -1, scoreDelta: 0.33999999999999997, improved: true },
    })
    expect(benchmarkPlanResult).toMatchObject({
      status: 'completed',
      output: {
        suite: 'local',
        outputPath: 'benchmarks/results/local.json',
        unknownCaseIds: ['missing-case'],
        cases: expect.arrayContaining([
          expect.objectContaining({
            id: 'spec-workbench',
            prompt: expect.stringContaining('Create a spec'),
            successCriteria: expect.arrayContaining(['The Spec Workbench shows exactly one active change for the benchmark task.']),
          }),
        ]),
        resultTemplate: expect.arrayContaining([expect.objectContaining({ caseId: 'spec-workbench', status: null })]),
      },
    })
    expect(benchmarkArtifactResult).toMatchObject({
      status: 'completed',
      output: {
        summary: { suite: 'local', passed: 1, failed: 1, score: 0.5 },
        outputPath: 'benchmarks/results/local.json',
        approvalRequiredForWrite: true,
        liveMutationApplied: false,
      },
    })
    expect(benchmarkArtifactResult.output).toMatchObject({
      missingCaseIds: expect.arrayContaining(['approval-pause-resume']),
      unknownCaseIds: [],
    })
    expect(writeBenchmarkArtifactResult).toMatchObject({
      status: 'completed',
      output: { path: 'benchmarks/results/local.json' },
    })
    await expect(readFile(path.join(rootPath, 'benchmarks/results/local.json'), 'utf8')).resolves.toContain('"suite": "local"')
    expect(benchmarkResultsResult).toMatchObject({
      status: 'completed',
      output: {
        results: [expect.objectContaining({ suite: 'local', path: 'benchmarks/results/local.json', summary: { suite: 'local', passed: 1, failed: 1, score: 0.5 } })],
        invalidFiles: [expect.objectContaining({ path: 'benchmarks/results/broken.json' })],
      },
    })
    expect(promotionResult).toMatchObject({
      status: 'completed',
      output: {
        promotionReady: true,
        blockers: [],
        approvalRequiredForPromotion: true,
        liveMutationApplied: false,
      },
    })
  })

  it('blocks harness promotion artifacts when benchmark comparison regresses', async () => {
    const rootPath = await createWorkspace()
    const result = await createExecutor().execute(
      createExecutionInput({
        actionId: 'create_harness_promotion_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          manifest: {
            id: 'change-1',
            title: 'Tighten provider instructions',
            rootCause: 'Benchmark evidence shows missing validation reminders.',
            proposedFix: 'Add a concise validation reminder to build mode.',
            predictedEffect: 'More runs will validate edits before completion.',
            affectedComponents: ['core.instructions'],
            evidence: ['benchmark local-edit failed validation'],
            benchmarkSuites: ['local'],
            tests: ['pnpm test'],
            rollbackPlan: 'Revert the instruction text change in packages/core/src/instructions.ts.',
            patchPreview: 'diff --git a/packages/core/src/instructions.ts b/packages/core/src/instructions.ts',
            createdAt: '2026-04-29T10:00:00.000Z',
          },
          benchmarkComparison: {
            before: { suite: 'local', passed: 3, failed: 0, score: 1 },
            after: { suite: 'local', passed: 2, failed: 1, score: 0.66 },
            passedDelta: -1,
            failedDelta: 1,
            scoreDelta: -0.33999999999999997,
            improved: false,
          },
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        promotionReady: false,
        blockers: ['Benchmark comparison did not improve.', 'Benchmark comparison increased failures.'],
        approvalRequiredForPromotion: true,
        liveMutationApplied: false,
      },
    })
  })

  it('creates draft skill improvement artifacts without mutating skill files', async () => {
    const rootPath = await createWorkspace()
    const executor = createExecutor()
    const result = await executor.execute(
      createExecutionInput({
        actionId: 'create_skill_improvement_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          title: 'Add release notes workflow skill',
          mode: 'create',
          rationale: 'Repeated release note tasks need a focused evidence workflow.',
          evidence: ['run:run-1', 'validation:pnpm typecheck passed'],
          skillName: 'Release Notes',
          description: 'Draft release notes from local git evidence.',
          triggers: ['release', 'changelog'],
          tools: ['git_diff', 'read_file'],
          safetyNotes: ['Do not invent user-facing changes.'],
          body: '# Release Notes\nUse git diff and changed files as evidence.',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        liveMutationApplied: false,
        approvalRequiredForWrite: true,
        artifact: {
          mode: 'create',
          approvalRequiredForWrite: true,
          proposedFiles: [{
            relativePath: '.nano/skills/release-notes/SKILL.md',
            content: expect.stringContaining('name: Release Notes'),
          }],
        },
      },
    })
  })

  it('writes approved skill improvement artifacts under .nano/skills', async () => {
    const rootPath = await createWorkspace()
    const executor = createExecutor()
    const createResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_skill_improvement_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          title: 'Add release notes workflow skill',
          mode: 'create',
          rationale: 'Repeated release note tasks need a focused evidence workflow.',
          evidence: ['run:run-1'],
          skillName: 'Release Notes',
          description: 'Draft release notes from local git evidence.',
          body: '# Release Notes\nUse git diff and changed files as evidence.',
        },
      }),
    )

    if (!createResult.output || Array.isArray(createResult.output) || typeof createResult.output !== 'object' || !('artifact' in createResult.output)) {
      throw new Error('Expected create_skill_improvement_artifact to return an artifact')
    }

    const writeResult = await executor.execute(
      createExecutionInput({
        actionId: 'write_skill_improvement_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          artifact: createResult.output.artifact,
        },
      }),
    )

    await expect(readFile(path.join(rootPath, '.nano/skills/release-notes/SKILL.md'), 'utf8')).resolves.toContain('name: Release Notes')
    expect(writeResult).toMatchObject({
      status: 'completed',
      output: {
        liveMutationApplied: true,
        writtenFiles: [{ path: '.nano/skills/release-notes/SKILL.md' }],
      },
    })
  })

  it('rejects skill improvement writes outside skill SKILL.md paths', async () => {
    const rootPath = await createWorkspace()
    const executor = createExecutor()

    await expect(executor.execute(
      createExecutionInput({
        actionId: 'write_skill_improvement_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          artifact: {
            id: 'skill-improvement-1',
            mode: 'create',
            title: 'Bad path',
            rationale: 'Validate path constraints.',
            evidence: ['run:run-1'],
            proposedFiles: [{ relativePath: '.nano/skills/release-notes/README.md', content: 'nope' }],
            patchPreview: 'diff --git a/.nano/skills/release-notes/README.md b/.nano/skills/release-notes/README.md',
            approvalRequiredForWrite: true,
            createdAt: '2026-04-29T10:00:00.000Z',
          },
        },
      }),
    )).resolves.toMatchObject({
      status: 'failed',
      errorMessage: 'write_skill_improvement_artifact paths must match .nano/skills/<skill-id>/SKILL.md',
    })
  })

  it('creates spec and draft PR artifacts without remote push', async () => {
    const rootPath = await createWorkspace()
    const executor = createExecutor()
    const specResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_spec_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          task: 'Fix the settings crash',
          acceptanceCriteria: ['Settings saves without crashing.'],
          validationPlan: ['pnpm test'],
        },
      }),
    )

    expect(specResult).toMatchObject({
      status: 'completed',
      output: {
        buildRequiresApproval: true,
        branchCreationRequiresApproval: true,
        remotePushRequiresApproval: true,
      },
    })

    if (!specResult.output || Array.isArray(specResult.output) || typeof specResult.output !== 'object' || !('spec' in specResult.output)) {
      throw new Error('Expected create_spec_artifact to return a spec output')
    }

    const draftResult = await executor.execute(
      createExecutionInput({
        actionId: 'create_draft_pr_artifact',
        settings: { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } },
        input: {
          spec: specResult.output.spec,
          changedFiles: ['apps/desktop/src/renderer/routes/SettingsRoute.tsx'],
          validationOutputs: ['pnpm test passed'],
          evidenceLinks: ['run-evidence.json'],
        },
      }),
    )

    expect(draftResult).toMatchObject({
      status: 'completed',
      output: {
        draftPr: { pushRequiresApproval: true },
        evidencePacket: { changedFiles: ['apps/desktop/src/renderer/routes/SettingsRoute.tsx'] },
        remotePushBlockedUntilApproval: true,
      },
    })
  })

  it('manages local spec workspace artifacts through approval-gated spec actions', async () => {
    const rootPath = await createWorkspace()
    const executor = createExecutor()
    const settings = { ...workspaceSettings, workspace: { ...workspaceSettings.workspace, rootPath } }

    const writeProposalResult = await executor.execute(createExecutionInput({
      actionId: 'write_spec_artifact',
      settings,
      input: {
        changeId: 'add-spec-workbench',
        artifactKind: 'proposal',
        content: '# Add Spec Workbench\n\nCreate a visible specs screen.\n',
      },
    }))
    const writeTasksResult = await executor.execute(createExecutionInput({
      actionId: 'write_spec_artifact',
      settings,
      input: {
        changeId: 'add-spec-workbench',
        artifactKind: 'tasks',
        content: '- [ ] contracts: Add shared schemas\n- [ ] ui: Add route\n',
      },
    }))
    const appendEvidenceResult = await executor.execute(createExecutionInput({
      actionId: 'append_spec_evidence',
      settings,
      input: {
        changeId: 'add-spec-workbench',
        runs: ['run-1'],
        approvals: ['approval-1'],
        changedFiles: ['packages/shared/src/spec.ts'],
        validation: ['pnpm typecheck passed'],
      },
    }))
    const updateTaskResult = await executor.execute(createExecutionInput({
      actionId: 'update_spec_task',
      settings,
      input: {
        changeId: 'add-spec-workbench',
        taskId: 'contracts',
        status: 'done',
      },
    }))
    const listResult = await executor.execute(createExecutionInput({
      actionId: 'list_spec_changes',
      settings,
      input: {},
    }))
    const readResult = await executor.execute(createExecutionInput({
      actionId: 'read_spec_artifact',
      settings,
      input: {
        changeId: 'add-spec-workbench',
        artifactKind: 'tasks',
      },
    }))
    const archiveResult = await executor.execute(createExecutionInput({
      actionId: 'archive_spec_change',
      settings,
      input: {
        changeId: 'add-spec-workbench',
      },
    }))

    expect(writeProposalResult).toMatchObject({ status: 'completed', output: { path: '.nano/specs/changes/add-spec-workbench/proposal.md' } })
    expect(writeTasksResult).toMatchObject({ status: 'completed', output: { path: '.nano/specs/changes/add-spec-workbench/tasks.md' } })
    expect(appendEvidenceResult).toMatchObject({
      status: 'completed',
      output: {
        changeId: 'add-spec-workbench',
        runs: ['run-1'],
        approvals: ['approval-1'],
        changedFiles: ['packages/shared/src/spec.ts'],
        validation: ['pnpm typecheck passed'],
      },
    })
    expect(updateTaskResult).toMatchObject({ status: 'completed', output: { task: { id: 'contracts', status: 'done' } } })
    expect(listResult).toMatchObject({
      status: 'completed',
      output: {
        changes: [expect.objectContaining({
          summary: expect.objectContaining({
            id: 'add-spec-workbench',
            title: 'Add Spec Workbench',
            linkedRunIds: ['run-1'],
          }),
        })],
      },
    })
    expect(readResult).toMatchObject({ status: 'completed', output: { content: '- [x] contracts: Add shared schemas\n- [ ] ui: Add route\n' } })
    expect(archiveResult).toMatchObject({ status: 'completed', output: { archivedPath: '.nano/specs/archive/add-spec-workbench' } })
  })

  it('exposes spec action approval requirements in definitions', async () => {
    const executor = createExecutor()

    await expect(executor.getDefinition('list_spec_changes')).resolves.toMatchObject({ requiresApproval: false })
    await expect(executor.getDefinition('read_spec_artifact')).resolves.toMatchObject({ requiresApproval: false })
    await expect(executor.getDefinition('write_spec_artifact')).resolves.toMatchObject({ requiresApproval: true })
    await expect(executor.getDefinition('update_spec_task')).resolves.toMatchObject({ requiresApproval: true })
    await expect(executor.getDefinition('append_spec_evidence')).resolves.toMatchObject({ requiresApproval: true })
    await expect(executor.getDefinition('archive_spec_change')).resolves.toMatchObject({ requiresApproval: true })
    await expect(executor.getDefinition('write_skill_improvement_artifact')).resolves.toMatchObject({ requiresApproval: true })
  })
})

function createExecutor() {
  return new BuiltInActionExecutor()
}

function createExecutionInput(input: {
  actionId: string
  settings: AppSettings
  input: Record<string, JsonValue>
}): ActionExecutionInput {
  const action: ActionDefinition = {
    id: input.actionId,
    title: input.actionId,
    requiresApproval: ['write_file', 'apply_patch', 'run_command', 'propose_harness_change', 'write_benchmark_run_artifact', 'write_skill_improvement_artifact', 'write_spec_artifact', 'update_spec_task', 'append_spec_evidence', 'archive_spec_change'].includes(input.actionId),
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  }

  return {
    run: testRun,
    action,
    call: {
      id: `${input.actionId}-call-1`,
      runId: testRun.id,
      actionId: input.actionId,
      input: input.input,
      requestedAt: '2026-04-29T10:00:00.000Z',
    },
    settings: input.settings,
    signal: new AbortController().signal,
  }
}

function expectActionOutput(output: JsonValue | undefined): JsonValue {
  expect(output).toBeDefined()
  return output as JsonValue
}

async function createWorkspace(): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'nano-harness-actions-'))
  cleanupPaths.push(rootPath)
  return rootPath
}

async function writeBenchmarkCase(rootPath: string, caseId: string, content: string): Promise<void> {
  const casePath = path.join(rootPath, 'benchmarks/cases', `${caseId}.md`)
  await mkdir(path.dirname(casePath), { recursive: true })
  await writeFile(casePath, `${content}\n`, 'utf8')
}
