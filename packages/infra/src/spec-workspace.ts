import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  jsonValueSchema,
  specChangeDetailSchema,
  specChangeStatusSchema,
  specEvidenceLinkSchema,
  specTaskSchema,
  type JsonValue,
  type SpecArtifactKind,
  type SpecChangeDetail,
  type SpecChangeSummary,
  type SpecChangeStatus,
  type SpecTask,
} from '@nano-harness/shared'

import { resolveWorkspacePath } from './actions/workspace'

export type SpecWorkspaceEvidenceFile = {
  changeId: string
  status: SpecChangeStatus
  createdAt: string
  updatedAt: string
  runs: string[]
  approvals: string[]
  changedFiles: string[]
  validation: string[]
  benchmarkObservations: string[]
  draftPr: JsonValue | null
}

export type SpecWorkspaceArtifact = {
  kind: SpecArtifactKind
  path: string
  content: string
}

export class SpecWorkspaceService {
  resolveSpecsRoot(workspaceRoot: string): string {
    return resolveWorkspacePath(workspaceRoot, '.nano/specs')
  }

  resolveSpecPath(workspaceRoot: string, relativePath = '.'): string {
    return resolveWorkspacePath(workspaceRoot, path.posix.join('.nano/specs', normalizeSpecRelativePath(relativePath)))
  }

  async listChanges(workspaceRoot: string, input: { includeArchived?: boolean } = {}): Promise<SpecChangeDetail[]> {
    const changes = await this.listChangeDirectory(workspaceRoot, 'changes')

    if (!input.includeArchived) {
      return changes
    }

    const archivedChanges = await this.listChangeDirectory(workspaceRoot, 'archive')
    return [...changes, ...archivedChanges]
      .sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt) || left.summary.id.localeCompare(right.summary.id))
  }

  async getChange(workspaceRoot: string, changeId: string): Promise<SpecChangeDetail | null> {
    const normalizedChangeId = normalizeChangeId(changeId)
    const activePath = this.resolveChangePath(workspaceRoot, 'changes', normalizedChangeId)

    if (await exists(activePath)) {
      return this.readChangeDetail(workspaceRoot, 'changes', normalizedChangeId)
    }

    const archivePath = this.resolveChangePath(workspaceRoot, 'archive', normalizedChangeId)

    if (await exists(archivePath)) {
      return this.readChangeDetail(workspaceRoot, 'archive', normalizedChangeId)
    }

    return null
  }

  async readArtifact(workspaceRoot: string, input: {
    changeId?: string
    kind: SpecArtifactKind
    relativePath?: string
  }): Promise<SpecWorkspaceArtifact> {
    const artifactPath = this.resolveArtifactPath(workspaceRoot, input)
    const content = await readFile(artifactPath.absolutePath, 'utf8')

    return {
      kind: input.kind,
      path: artifactPath.displayPath,
      content,
    }
  }

  async writeArtifact(workspaceRoot: string, input: {
    changeId?: string
    kind: SpecArtifactKind
    relativePath?: string
    content: string
  }): Promise<{ path: string; bytesWritten: number; changeCreated?: boolean; change?: SpecChangeSummary }> {
    const normalizedChangeId = input.kind === 'current_spec' || !input.changeId ? null : normalizeChangeId(input.changeId)
    const changePath = normalizedChangeId ? this.resolveChangePath(workspaceRoot, 'changes', normalizedChangeId) : null
    const changeExisted = changePath ? await exists(changePath) : false
    const artifactPath = this.resolveArtifactPath(workspaceRoot, input)

    await mkdir(path.dirname(artifactPath.absolutePath), { recursive: true })
    await writeFile(artifactPath.absolutePath, input.content, 'utf8')

    const change = normalizedChangeId ? (await this.readChangeDetail(workspaceRoot, 'changes', normalizedChangeId)).summary : undefined

    return {
      path: artifactPath.displayPath,
      bytesWritten: Buffer.byteLength(input.content, 'utf8'),
      ...(normalizedChangeId ? { changeCreated: !changeExisted, change } : {}),
    }
  }

  async updateTask(workspaceRoot: string, input: {
    changeId: string
    taskId: string
    status: SpecTask['status']
  }): Promise<{ path: string; task: SpecTask }> {
    const artifactPath = this.resolveArtifactPath(workspaceRoot, {
      changeId: input.changeId,
      kind: 'tasks',
    })
    const content = await readFile(artifactPath.absolutePath, 'utf8')
    const lines = content.split('\n')
    const tasks = this.parseTasks(content)
    const task = tasks.find((item) => item.id === input.taskId)

    if (!task?.sourceLine) {
      throw new Error(`Spec task ${input.taskId} not found`)
    }

    lines[task.sourceLine - 1] = replaceTaskCheckbox(lines[task.sourceLine - 1] ?? '', input.status)
    await writeFile(artifactPath.absolutePath, lines.join('\n'), 'utf8')

    return {
      path: artifactPath.displayPath,
      task: specTaskSchema.parse({
        ...task,
        status: input.status,
      }),
    }
  }

  async appendEvidence(workspaceRoot: string, input: {
    changeId: string
    runs?: string[]
    approvals?: string[]
    changedFiles?: string[]
    validation?: string[]
    benchmarkObservations?: string[]
    updatedAt: string
  }): Promise<SpecWorkspaceEvidenceFile> {
    const existingEvidence = await this.readEvidence(workspaceRoot, input.changeId)
    const evidence = parseEvidenceFile({
      changeId: input.changeId,
      status: existingEvidence?.status ?? 'draft',
      createdAt: existingEvidence?.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
      runs: mergeUnique(existingEvidence?.runs, input.runs),
      approvals: mergeUnique(existingEvidence?.approvals, input.approvals),
      changedFiles: mergeUnique(existingEvidence?.changedFiles, input.changedFiles),
      validation: mergeUnique(existingEvidence?.validation, input.validation),
      benchmarkObservations: mergeUnique(existingEvidence?.benchmarkObservations, input.benchmarkObservations),
      draftPr: existingEvidence?.draftPr ?? null,
    })

    return this.writeEvidence(workspaceRoot, evidence)
  }

  parseTasks(content: string): SpecTask[] {
    return content
      .split('\n')
      .map((line, index) => parseTaskLine(line, index + 1))
      .filter((task): task is SpecTask => task !== null)
  }

  async readEvidence(workspaceRoot: string, changeId: string): Promise<SpecWorkspaceEvidenceFile | null> {
    const evidencePath = this.resolveArtifactPath(workspaceRoot, {
      changeId,
      kind: 'evidence',
    }).absolutePath

    if (!(await exists(evidencePath))) {
      return null
    }

    return parseEvidenceFile(JSON.parse(await readFile(evidencePath, 'utf8')))
  }

  async writeEvidence(workspaceRoot: string, evidence: SpecWorkspaceEvidenceFile): Promise<SpecWorkspaceEvidenceFile> {
    const parsedEvidence = parseEvidenceFile(evidence)
    const evidencePath = this.resolveArtifactPath(workspaceRoot, {
      changeId: parsedEvidence.changeId,
      kind: 'evidence',
    }).absolutePath

    await mkdir(path.dirname(evidencePath), { recursive: true })
    await writeFile(evidencePath, `${JSON.stringify(parsedEvidence, null, 2)}\n`, 'utf8')

    return parsedEvidence
  }

  async archiveChange(workspaceRoot: string, changeId: string): Promise<string> {
    const normalizedChangeId = normalizeChangeId(changeId)
    const sourcePath = this.resolveChangePath(workspaceRoot, 'changes', normalizedChangeId)
    const archiveRoot = this.resolveSpecPath(workspaceRoot, 'archive')
    const targetPath = this.resolveChangePath(workspaceRoot, 'archive', normalizedChangeId)

    await mkdir(archiveRoot, { recursive: true })
    await rename(sourcePath, targetPath)

    return path.posix.join('.nano/specs/archive', normalizedChangeId)
  }

  private async listChangeDirectory(workspaceRoot: string, bucket: 'changes' | 'archive'): Promise<SpecChangeDetail[]> {
    const directoryPath = this.resolveSpecPath(workspaceRoot, bucket)

    if (!(await exists(directoryPath))) {
      return []
    }

    const entries = await readdir(directoryPath, { withFileTypes: true })
    const changes = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readChangeDetail(workspaceRoot, bucket, entry.name)),
    )

    return changes.sort((left, right) => right.summary.updatedAt.localeCompare(left.summary.updatedAt) || left.summary.id.localeCompare(right.summary.id))
  }

  private async readChangeDetail(workspaceRoot: string, bucket: 'changes' | 'archive', changeId: string): Promise<SpecChangeDetail> {
    const normalizedChangeId = normalizeChangeId(changeId)
    const changePath = this.resolveChangePath(workspaceRoot, bucket, normalizedChangeId)
    const artifactPaths = await this.listArtifactPaths(changePath, path.posix.join('.nano/specs', bucket, normalizedChangeId))
    const evidence = await this.readEvidenceForBucket(workspaceRoot, bucket, normalizedChangeId)
    const tasksArtifact = artifactPaths.find((artifact) => artifact.kind === 'tasks')
    const tasks = tasksArtifact ? this.parseTasks(await readFile(resolveWorkspacePath(workspaceRoot, tasksArtifact.path), 'utf8')) : []
    const taskCounts = countTasks(tasks)
    const updatedAt = evidence?.updatedAt ?? await getDirectoryUpdatedAt(changePath)
    const status = bucket === 'archive' ? 'archived' : evidence?.status ?? inferStatus(artifactPaths.map((artifact) => artifact.kind), taskCounts)

    return specChangeDetailSchema.parse({
      summary: {
        id: normalizedChangeId,
        title: await readChangeTitle(changePath, normalizedChangeId),
        status,
        path: path.posix.join('.nano/specs', bucket, normalizedChangeId),
        taskCounts,
        updatedAt,
        linkedRunIds: evidence?.runs ?? [],
      },
      artifactPaths,
      tasks,
      evidenceLinks: specEvidenceLinkSchema.parse({
        runIds: evidence?.runs ?? [],
        approvalIds: evidence?.approvals ?? [],
        changedFiles: evidence?.changedFiles ?? [],
        validationOutputs: evidence?.validation ?? [],
        benchmarkObservations: evidence?.benchmarkObservations ?? [],
      }),
    })
  }

  private async listArtifactPaths(changePath: string, displayBasePath: string): Promise<Array<{ kind: SpecArtifactKind; path: string }>> {
    const artifacts: Array<{ kind: SpecArtifactKind; path: string }> = []

    for (const artifact of [
      { kind: 'proposal' as const, filePath: 'proposal.md' },
      { kind: 'design' as const, filePath: 'design.md' },
      { kind: 'tasks' as const, filePath: 'tasks.md' },
      { kind: 'evidence' as const, filePath: 'evidence.json' },
    ]) {
      if (await exists(path.join(changePath, artifact.filePath))) {
        artifacts.push({ kind: artifact.kind, path: path.posix.join(displayBasePath, artifact.filePath) })
      }
    }

    const deltaSpecsPath = path.join(changePath, 'specs')

    if (await exists(deltaSpecsPath)) {
      for (const specPath of await listMarkdownFiles(deltaSpecsPath)) {
        artifacts.push({
          kind: 'delta_spec',
          path: path.posix.join(displayBasePath, 'specs', specPath),
        })
      }
    }

    return artifacts
  }

  private async readEvidenceForBucket(workspaceRoot: string, bucket: 'changes' | 'archive', changeId: string): Promise<SpecWorkspaceEvidenceFile | null> {
    const evidencePath = path.join(this.resolveChangePath(workspaceRoot, bucket, changeId), 'evidence.json')

    if (!(await exists(evidencePath))) {
      return null
    }

    return parseEvidenceFile(JSON.parse(await readFile(evidencePath, 'utf8')))
  }

  private resolveChangePath(workspaceRoot: string, bucket: 'changes' | 'archive', changeId: string): string {
    return this.resolveSpecPath(workspaceRoot, path.posix.join(bucket, normalizeChangeId(changeId)))
  }

  private resolveArtifactPath(workspaceRoot: string, input: {
    changeId?: string
    kind: SpecArtifactKind
    relativePath?: string
  }): { absolutePath: string; displayPath: string } {
    const relativePath = normalizeSpecRelativePath(input.relativePath ?? '')
    let specRelativePath: string

    if (input.kind === 'current_spec') {
      if (!relativePath || relativePath === '.') {
        throw new Error('current_spec requires a relativePath under current/')
      }

      specRelativePath = path.posix.join('current', relativePath)
    } else {
      if (!input.changeId) {
        throw new Error(`${input.kind} requires a changeId`)
      }

      const changeId = normalizeChangeId(input.changeId)

      if (input.kind === 'delta_spec') {
        if (!relativePath || relativePath === '.') {
          throw new Error('delta_spec requires a relativePath under specs/')
        }

        specRelativePath = path.posix.join('changes', changeId, 'specs', relativePath)
      } else {
        specRelativePath = path.posix.join('changes', changeId, getArtifactFileName(input.kind))
      }
    }

    const displayPath = path.posix.join('.nano/specs', specRelativePath)
    return {
      absolutePath: resolveWorkspacePath(workspaceRoot, displayPath),
      displayPath,
    }
  }
}

function parseEvidenceFile(value: unknown): SpecWorkspaceEvidenceFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Spec evidence must be an object')
  }

  const record = value as Record<string, unknown>

  return {
    changeId: parseRequiredString(record.changeId, 'changeId'),
    status: record.status === undefined ? 'draft' : specChangeStatusSchema.parse(record.status),
    createdAt: parseDateTime(record.createdAt, 'createdAt'),
    updatedAt: parseDateTime(record.updatedAt, 'updatedAt'),
    runs: parseStringArray(record.runs, 'runs'),
    approvals: parseStringArray(record.approvals, 'approvals'),
    changedFiles: parseStringArray(record.changedFiles, 'changedFiles'),
    validation: parseStringArray(record.validation, 'validation'),
    benchmarkObservations: parseStringArray(record.benchmarkObservations, 'benchmarkObservations'),
    draftPr: record.draftPr === undefined ? null : jsonValueSchema.nullable().parse(record.draftPr),
  }
}

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Spec evidence ${fieldName} must be a non-empty string`)
  }

  return value
}

function parseDateTime(value: unknown, fieldName: string): string {
  const parsedValue = parseRequiredString(value, fieldName)

  if (Number.isNaN(Date.parse(parsedValue))) {
    throw new Error(`Spec evidence ${fieldName} must be an ISO datetime`)
  }

  return parsedValue
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`Spec evidence ${fieldName} must be an array of non-empty strings`)
  }

  return value
}

function normalizeSpecRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').trim()
  const segments: string[] = []

  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      throw new Error(`Spec path ${value} is outside .nano/specs`)
    }

    segments.push(segment)
  }

  return segments.length ? segments.join('/') : '.'
}

function normalizeChangeId(value: string): string {
  const normalized = normalizeSpecRelativePath(value)

  if (!normalized || normalized === '.' || normalized.includes('/')) {
    throw new Error('Spec changeId must be a single path segment')
  }

  return normalized
}

function getArtifactFileName(kind: SpecArtifactKind): string {
  switch (kind) {
    case 'proposal':
      return 'proposal.md'
    case 'design':
      return 'design.md'
    case 'tasks':
      return 'tasks.md'
    case 'evidence':
      return 'evidence.json'
    case 'delta_spec':
    case 'current_spec':
      throw new Error(`${kind} requires a relativePath`)
  }
}

function parseTaskLine(line: string, sourceLine: number): SpecTask | null {
  const match = /^\s*-\s*\[(?<checkbox>[ xX~-])\]\s*(?:(?<id>[A-Za-z0-9_.-]+)[:.)]\s*)?(?<title>.+?)\s*$/.exec(line)

  if (!match?.groups) {
    return null
  }

  const checkbox = match.groups.checkbox
  const rawTitle = match.groups.title.trim()
  const status = checkbox === 'x' || checkbox === 'X'
    ? 'done'
    : checkbox === '~'
      ? 'in_progress'
      : checkbox === '-'
        ? 'blocked'
        : 'todo'

  return specTaskSchema.parse({
    id: match.groups.id ?? `task-${sourceLine}`,
    title: rawTitle,
    status,
    sourceLine,
  })
}

function replaceTaskCheckbox(line: string, status: SpecTask['status']): string {
  const checkbox = status === 'done'
    ? 'x'
    : status === 'in_progress'
      ? '~'
      : status === 'blocked'
        ? '-'
        : ' '

  if (!/^\s*-\s*\[[ xX~-]\]/.test(line)) {
    throw new Error('Spec task line is not a markdown checkbox')
  }

  return line.replace(/\[[ xX~-]\]/, `[${checkbox}]`)
}

function mergeUnique(left: string[] = [], right: string[] = []): string[] {
  return [...new Set([...left, ...right])]
}

function countTasks(tasks: SpecTask[]) {
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
  }
}

function inferStatus(kinds: SpecArtifactKind[], taskCounts: ReturnType<typeof countTasks>): SpecChangeStatus {
  if (taskCounts.total > 0 && taskCounts.done === taskCounts.total) {
    return 'implemented'
  }

  if (taskCounts.inProgress > 0) {
    return 'building'
  }

  if (kinds.includes('proposal') || kinds.includes('design') || kinds.includes('tasks')) {
    return 'proposed'
  }

  return 'draft'
}

async function readChangeTitle(changePath: string, fallback: string): Promise<string> {
  const proposalPath = path.join(changePath, 'proposal.md')

  if (!(await exists(proposalPath))) {
    return fallback
  }

  const heading = (await readFile(proposalPath, 'utf8'))
    .split('\n')
    .find((line) => line.trim().startsWith('#'))
    ?.replace(/^#+\s*/, '')
    .trim()

  return heading || fallback
}

async function listMarkdownFiles(rootPath: string, basePath = ''): Promise<string[]> {
  const entries = await readdir(path.join(rootPath, basePath), { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.posix.join(basePath, entry.name)

    if (entry.isDirectory()) {
      return listMarkdownFiles(rootPath, entryPath)
    }

    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : []
  }))

  return files.flat().sort((left, right) => left.localeCompare(right))
}

async function getDirectoryUpdatedAt(directoryPath: string): Promise<string> {
  return (await stat(directoryPath)).mtime.toISOString()
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}
