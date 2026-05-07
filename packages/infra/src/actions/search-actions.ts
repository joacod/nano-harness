import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { createActionResult, type BuiltInActionCommand } from './types'
import { resolveWorkspacePath, toPosixPath } from './workspace'

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

export const searchActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
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
    async execute(input) {
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
    },
  },
  {
    definition: {
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
    async execute(input) {
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
    },
  },
]
