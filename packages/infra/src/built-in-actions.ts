import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ActionExecutionInput, ActionExecutor } from '@nano-harness/core'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

function parseReadFileInput(value: Record<string, unknown>): { path: string } {
  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('read_file requires a non-empty string path')
  }

  return { path: value.path }
}

function parseReadRangeInput(value: Record<string, unknown>): { path: string; startLine: number; maxLines: number } {
  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('read_range requires a non-empty string path')
  }

  const startLine = typeof value.startLine === 'number' ? value.startLine : 1
  const maxLines = typeof value.maxLines === 'number' ? value.maxLines : 200

  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error('read_range startLine must be a positive integer')
  }

  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 1000) {
    throw new Error('read_range maxLines must be an integer between 1 and 1000')
  }

  return { path: value.path, startLine, maxLines }
}

function parseListDirectoryInput(value: Record<string, unknown>): { path: string } {
  if (value.path === undefined) {
    return { path: '.' }
  }

  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('list_directory path must be a non-empty string when provided')
  }

  return { path: value.path }
}

function parseWriteFileInput(value: Record<string, unknown>): { path: string; content: string } {
  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('write_file requires a non-empty string path')
  }

  if (typeof value.content !== 'string') {
    throw new Error('write_file requires string content')
  }

  return {
    path: value.path,
    content: value.content,
  }
}

function parseApplyPatchInput(value: Record<string, unknown>): { path: string; oldText: string; newText: string } {
  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('apply_patch requires a non-empty string path')
  }

  if (typeof value.oldText !== 'string' || value.oldText.length === 0) {
    throw new Error('apply_patch requires non-empty string oldText')
  }

  if (typeof value.newText !== 'string') {
    throw new Error('apply_patch requires string newText')
  }

  return { path: value.path, oldText: value.oldText, newText: value.newText }
}

function parseGlobInput(value: Record<string, unknown>): { pattern: string; maxResults: number } {
  if (typeof value.pattern !== 'string' || !value.pattern.trim()) {
    throw new Error('glob requires a non-empty string pattern')
  }

  const maxResults = typeof value.maxResults === 'number' ? value.maxResults : 200

  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 1000) {
    throw new Error('glob maxResults must be an integer between 1 and 1000')
  }

  return { pattern: value.pattern, maxResults }
}

function parseGrepInput(value: Record<string, unknown>): { pattern: string; include: string; maxMatches: number } {
  if (typeof value.pattern !== 'string' || !value.pattern.trim()) {
    throw new Error('grep requires a non-empty string pattern')
  }

  const include = typeof value.include === 'string' && value.include.trim() ? value.include : '**/*'
  const maxMatches = typeof value.maxMatches === 'number' ? value.maxMatches : 100

  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 500) {
    throw new Error('grep maxMatches must be an integer between 1 and 500')
  }

  return { pattern: value.pattern, include, maxMatches }
}

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

function parseFetchUrlInput(value: Record<string, unknown>): { url: string } {
  if (typeof value.url !== 'string' || !value.url.trim()) {
    throw new Error('fetch_url requires a non-empty string url')
  }

  try {
    const url = new URL(value.url)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('fetch_url only supports http and https URLs')
    }

    return { url: url.toString() }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'fetch_url requires a valid URL', {
      cause: error,
    })
  }
}

const actionDefinitions: Record<string, ActionDefinition> = {
  list_directory: {
    id: 'list_directory',
    title: 'List Directory',
    description: 'List files and directories inside the configured workspace. Use this before guessing project paths.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to the workspace root. Defaults to .',
        },
      },
      additionalProperties: false,
    },
  },
  read_file: {
    id: 'read_file',
    title: 'Read File',
    description: 'Read a UTF-8 file from the configured workspace',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  read_range: {
    id: 'read_range',
    title: 'Read Range',
    description: 'Read a bounded line range from a UTF-8 file inside the configured workspace',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        startLine: { type: 'number' },
        maxLines: { type: 'number' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  glob: {
    id: 'glob',
    title: 'Glob',
    description: 'Find workspace files by glob pattern with bounded results',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        maxResults: { type: 'number' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  grep: {
    id: 'grep',
    title: 'Grep',
    description: 'Search UTF-8 workspace files with a regular expression and bounded matches',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        include: { type: 'string' },
        maxMatches: { type: 'number' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  apply_patch: {
    id: 'apply_patch',
    title: 'Apply Patch',
    description: 'Replace one exact text span in a workspace file without rewriting the full file',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
      additionalProperties: false,
    },
  },
  write_file: {
    id: 'write_file',
    title: 'Write File',
    description: 'Write a UTF-8 file inside the configured workspace',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
        },
        content: {
          type: 'string',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  fetch_url: {
    id: 'fetch_url',
    title: 'Fetch URL',
    description: 'Fetch a URL over HTTP or HTTPS',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
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
} satisfies Record<string, ActionDefinition>

function resolveWorkspacePath(rootPath: string, targetPath: string): string {
  const absoluteRoot = path.resolve(rootPath)
  const absoluteTarget = path.resolve(absoluteRoot, targetPath)
  const relativeTarget = path.relative(absoluteRoot, absoluteTarget)

  if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
    throw new Error(`Path ${targetPath} is outside the configured workspace root`)
  }

  return absoluteTarget
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/')
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function globToRegExp(pattern: string): RegExp {
  const normalized = toPosixPath(pattern).replace(/^\.\//, '')
  let source = ''

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]
    const following = normalized[index + 2]

    if (char === '*' && next === '*' && following === '/') {
      source += '(?:.*/)?'
      index += 2
    } else if (char === '*' && next === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegExp(char)
    }
  }

  return new RegExp(`^${source}$`)
}

function shouldSkipDirectory(name: string): boolean {
  return name === '.git' || name === 'node_modules' || name === 'dist' || name === 'out' || name === 'coverage'
}

async function listWorkspaceFiles(rootPath: string, maxFiles = 5000): Promise<string[]> {
  const files: string[] = []

  async function visit(directoryPath: string): Promise<void> {
    if (files.length >= maxFiles) {
      return
    }

    const entries = await readdir(directoryPath, { withFileTypes: true })

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return
      }

      const absolutePath = path.join(directoryPath, entry.name)
      const relativePath = toPosixPath(path.relative(rootPath, absolutePath))

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          await visit(absolutePath)
        }
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }

  await visit(rootPath)
  return files.sort((left, right) => left.localeCompare(right))
}

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

function createActionResult(input: {
  actionCallId: string
  status: ActionResult['status']
  output?: ActionResult['output']
  errorMessage?: string
}): ActionResult {
  return {
    id: `${input.actionCallId}-result`,
    actionCallId: input.actionCallId,
    status: input.status,
    output: input.output,
    errorMessage: input.errorMessage,
    completedAt: new Date().toISOString(),
  }
}

export class BuiltInActionExecutor implements ActionExecutor {
  async listDefinitions(): Promise<ActionDefinition[]> {
    return builtInActionDefinitions
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    return actionDefinitions[actionId] ?? null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    try {
      switch (input.action.id) {
        case 'list_directory': {
          const parsedInput = parseListDirectoryInput(input.call.input)
          const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
          const entries = await readdir(resolvedPath, { withFileTypes: true })

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              path: parsedInput.path,
              entries: entries
                .map((entry) => ({
                  name: entry.name,
                  type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
                  path: path.posix.join(parsedInput.path === '.' ? '' : parsedInput.path, entry.name),
                }))
                .sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name)),
            },
          })
        }
        case 'read_file': {
          const parsedInput = parseReadFileInput(input.call.input)
          const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
          const content = await readFile(resolvedPath, 'utf8')

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              path: parsedInput.path,
              content,
            },
          })
        }
        case 'read_range': {
          const parsedInput = parseReadRangeInput(input.call.input)
          const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
          const content = await readFile(resolvedPath, 'utf8')
          const lines = content.split('\n')
          const selectedLines = lines.slice(parsedInput.startLine - 1, parsedInput.startLine - 1 + parsedInput.maxLines)

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              path: parsedInput.path,
              startLine: parsedInput.startLine,
              endLine: parsedInput.startLine + selectedLines.length - 1,
              totalLines: lines.length,
              content: selectedLines.map((line, index) => `${parsedInput.startLine + index}: ${line}`).join('\n'),
            },
          })
        }
        case 'glob': {
          const parsedInput = parseGlobInput(input.call.input)
          const matcher = globToRegExp(parsedInput.pattern)
          const files = await listWorkspaceFiles(path.resolve(input.settings.workspace.rootPath))
          const matches = files.filter((filePath) => matcher.test(filePath)).slice(0, parsedInput.maxResults)

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              pattern: parsedInput.pattern,
              matches,
              truncated: files.filter((filePath) => matcher.test(filePath)).length > matches.length,
            },
          })
        }
        case 'grep': {
          const parsedInput = parseGrepInput(input.call.input)
          const includeMatcher = globToRegExp(parsedInput.include)
          const pattern = new RegExp(parsedInput.pattern)
          const files = await listWorkspaceFiles(path.resolve(input.settings.workspace.rootPath))
          const matches: Array<{ path: string; line: number; text: string }> = []

          for (const relativePath of files.filter((filePath) => includeMatcher.test(filePath))) {
            if (matches.length >= parsedInput.maxMatches) {
              break
            }

            const absolutePath = resolveWorkspacePath(input.settings.workspace.rootPath, relativePath)
            const fileStat = await stat(absolutePath)

            if (fileStat.size > 1024 * 1024) {
              continue
            }

            const content = await readFile(absolutePath, 'utf8')
            const lines = content.split('\n')

            for (let index = 0; index < lines.length && matches.length < parsedInput.maxMatches; index += 1) {
              if (pattern.test(lines[index])) {
                matches.push({ path: relativePath, line: index + 1, text: lines[index].slice(0, 500) })
              }
            }
          }

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              pattern: parsedInput.pattern,
              include: parsedInput.include,
              matches,
              truncated: matches.length >= parsedInput.maxMatches,
            },
          })
        }
        case 'apply_patch': {
          const parsedInput = parseApplyPatchInput(input.call.input)
          const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
          const content = await readFile(resolvedPath, 'utf8')
          const occurrences = content.split(parsedInput.oldText).length - 1

          if (occurrences !== 1) {
            throw new Error(`apply_patch expected exactly one oldText match, found ${occurrences}`)
          }

          const nextContent = content.replace(parsedInput.oldText, parsedInput.newText)
          await writeFile(resolvedPath, nextContent, 'utf8')

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              path: parsedInput.path,
              bytesChanged: Buffer.byteLength(parsedInput.newText, 'utf8') - Buffer.byteLength(parsedInput.oldText, 'utf8'),
            },
          })
        }
        case 'write_file': {
          const parsedInput = parseWriteFileInput(input.call.input)
          const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)

          await mkdir(path.dirname(resolvedPath), { recursive: true })
          await writeFile(resolvedPath, parsedInput.content, 'utf8')

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              path: parsedInput.path,
              bytesWritten: Buffer.byteLength(parsedInput.content, 'utf8'),
            },
          })
        }
        case 'fetch_url': {
          const parsedInput = parseFetchUrlInput(input.call.input)
          const response = await fetch(parsedInput.url, {
            signal: input.signal,
          })
          const body = await response.text()

          if (!response.ok) {
            return createActionResult({
              actionCallId: input.call.id,
              status: 'failed',
              errorMessage: `Fetch failed with ${response.status} ${response.statusText}`,
              output: {
                url: parsedInput.url,
                status: response.status,
                body: body.slice(0, 12000),
              },
            })
          }

          return createActionResult({
            actionCallId: input.call.id,
            status: 'completed',
            output: {
              url: parsedInput.url,
              status: response.status,
              contentType: response.headers.get('content-type') ?? '',
              body: body.slice(0, 12000),
            },
          })
        }
        case 'run_command': {
          const parsedInput = parseRunCommandInput(input.call.input)
          ensureAllowedCommand(parsedInput.command)
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
              cwd: parsedInput.cwd,
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
