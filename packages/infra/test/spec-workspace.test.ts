import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SpecWorkspaceService } from '../src'

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((cleanupPath) => rm(cleanupPath, { recursive: true, force: true })))
})

describe('SpecWorkspaceService', () => {
  it('lists spec changes with artifacts, tasks, and evidence links', async () => {
    const workspaceRoot = await createWorkspace()
    await writeSpecChange(workspaceRoot, 'add-spec-workbench')
    const service = new SpecWorkspaceService()

    const changes = await service.listChanges(workspaceRoot)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      summary: {
        id: 'add-spec-workbench',
        title: 'Add Spec Workbench',
        status: 'planned',
        path: '.nano/specs/changes/add-spec-workbench',
        taskCounts: { total: 3, todo: 1, inProgress: 1, done: 1, blocked: 0 },
        linkedRunIds: ['run-plan-1'],
      },
      artifactPaths: expect.arrayContaining([
        { kind: 'proposal', path: '.nano/specs/changes/add-spec-workbench/proposal.md' },
        { kind: 'design', path: '.nano/specs/changes/add-spec-workbench/design.md' },
        { kind: 'tasks', path: '.nano/specs/changes/add-spec-workbench/tasks.md' },
        { kind: 'evidence', path: '.nano/specs/changes/add-spec-workbench/evidence.json' },
        { kind: 'delta_spec', path: '.nano/specs/changes/add-spec-workbench/specs/ui/spec.md' },
      ]),
      evidenceLinks: {
        runIds: ['run-plan-1'],
        approvalIds: ['approval-1'],
        changedFiles: ['apps/desktop/src/renderer/router.tsx'],
        validationOutputs: ['pnpm typecheck passed'],
      },
    })
  })

  it('reads artifacts and current specs through bounded workspace paths', async () => {
    const workspaceRoot = await createWorkspace()
    await writeSpecChange(workspaceRoot, 'add-spec-workbench')
    await mkdir(path.join(workspaceRoot, '.nano', 'specs', 'current', 'ui'), { recursive: true })
    await writeFile(path.join(workspaceRoot, '.nano', 'specs', 'current', 'ui', 'spec.md'), '# Current UI Spec\n', 'utf8')
    const service = new SpecWorkspaceService()

    await expect(service.readArtifact(workspaceRoot, {
      changeId: 'add-spec-workbench',
      kind: 'proposal',
    })).resolves.toMatchObject({
      kind: 'proposal',
      path: '.nano/specs/changes/add-spec-workbench/proposal.md',
      content: '# Add Spec Workbench\n\nCreate a visible specs screen.\n',
    })
    await expect(service.readArtifact(workspaceRoot, {
      kind: 'current_spec',
      relativePath: 'ui/spec.md',
    })).resolves.toMatchObject({
      kind: 'current_spec',
      path: '.nano/specs/current/ui/spec.md',
      content: '# Current UI Spec\n',
    })
  })

  it('writes and reads evidence json for a change', async () => {
    const workspaceRoot = await createWorkspace()
    const service = new SpecWorkspaceService()
    const evidence = await service.writeEvidence(workspaceRoot, {
      changeId: 'memory-provenance',
      status: 'proposed',
      createdAt: '2026-05-14T10:00:00.000Z',
      updatedAt: '2026-05-14T10:05:00.000Z',
      runs: ['run-1'],
      approvals: [],
      changedFiles: [],
      validation: [],
      benchmarkObservations: [],
      draftPr: null,
    })

    await expect(service.readEvidence(workspaceRoot, 'memory-provenance')).resolves.toEqual(evidence)
    await expect(service.getChange(workspaceRoot, 'memory-provenance')).resolves.toMatchObject({
      summary: {
        id: 'memory-provenance',
        status: 'proposed',
        linkedRunIds: ['run-1'],
      },
    })
  })

  it('archives active changes', async () => {
    const workspaceRoot = await createWorkspace()
    await writeSpecChange(workspaceRoot, 'add-spec-workbench')
    const service = new SpecWorkspaceService()

    await expect(service.archiveChange(workspaceRoot, 'add-spec-workbench')).resolves.toBe('.nano/specs/archive/add-spec-workbench')
    await expect(service.listChanges(workspaceRoot)).resolves.toEqual([])
    await expect(service.listChanges(workspaceRoot, { includeArchived: true })).resolves.toHaveLength(1)
  })

  it('rejects traversal outside .nano/specs and the workspace root', async () => {
    const workspaceRoot = await createWorkspace()
    const service = new SpecWorkspaceService()

    expect(() => service.resolveSpecPath(workspaceRoot, '../outside')).toThrow('Spec path ../outside is outside .nano/specs')
    await expect(service.readArtifact(workspaceRoot, {
      kind: 'current_spec',
      relativePath: '../secret.md',
    })).rejects.toThrow('Spec path ../secret.md is outside .nano/specs')
    await expect(service.getChange(workspaceRoot, 'nested/change')).rejects.toThrow('Spec changeId must be a single path segment')
  })
})

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'nano-harness-specs-'))
  cleanupPaths.push(workspaceRoot)
  return workspaceRoot
}

async function writeSpecChange(workspaceRoot: string, changeId: string): Promise<void> {
  const changeRoot = path.join(workspaceRoot, '.nano', 'specs', 'changes', changeId)

  await mkdir(path.join(changeRoot, 'specs', 'ui'), { recursive: true })
  await writeFile(path.join(changeRoot, 'proposal.md'), '# Add Spec Workbench\n\nCreate a visible specs screen.\n', 'utf8')
  await writeFile(path.join(changeRoot, 'design.md'), '# Design\n\nUse a three-column workbench.\n', 'utf8')
  await writeFile(path.join(changeRoot, 'tasks.md'), [
    '- [x] contracts: Add shared schemas',
    '- [~] service: Add spec workspace service',
    '- [ ] ui: Add route',
  ].join('\n'), 'utf8')
  await writeFile(path.join(changeRoot, 'specs', 'ui', 'spec.md'), '# UI Delta\n', 'utf8')
  await writeFile(path.join(changeRoot, 'evidence.json'), `${JSON.stringify({
    changeId,
    status: 'planned',
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:05:00.000Z',
    runs: ['run-plan-1'],
    approvals: ['approval-1'],
    changedFiles: ['apps/desktop/src/renderer/router.tsx'],
    validation: ['pnpm typecheck passed'],
    draftPr: null,
  }, null, 2)}\n`, 'utf8')
}
