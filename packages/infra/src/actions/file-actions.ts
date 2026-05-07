import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { normalizeWorkspaceRelativePath } from '@nano-harness/core'

import { createActionResult, type BuiltInActionCommand } from './types'
import { resolveWorkspacePath } from './workspace'

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

export const fileActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
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
    async execute(input) {
      const parsedInput = parseListDirectoryInput(input.call.input)
      const workspacePath = normalizeWorkspaceRelativePath(parsedInput.path)
      const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
      const entries = await readdir(resolvedPath, { withFileTypes: true })

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          path: workspacePath,
          entries: entries
            .map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
              path: path.posix.join(workspacePath === '.' ? '' : workspacePath, entry.name),
            }))
            .sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name)),
        },
      })
    },
  },
  {
    definition: {
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
    async execute(input) {
      const parsedInput = parseReadFileInput(input.call.input)
      const workspacePath = normalizeWorkspaceRelativePath(parsedInput.path)
      const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
      const content = await readFile(resolvedPath, 'utf8')

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          path: workspacePath,
          content,
        },
      })
    },
  },
  {
    definition: {
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
    async execute(input) {
      const parsedInput = parseReadRangeInput(input.call.input)
      const workspacePath = normalizeWorkspaceRelativePath(parsedInput.path)
      const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)
      const content = await readFile(resolvedPath, 'utf8')
      const lines = content.split('\n')
      const selectedLines = lines.slice(parsedInput.startLine - 1, parsedInput.startLine - 1 + parsedInput.maxLines)

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          path: workspacePath,
          startLine: parsedInput.startLine,
          endLine: parsedInput.startLine + selectedLines.length - 1,
          totalLines: lines.length,
          content: selectedLines.map((line, index) => `${parsedInput.startLine + index}: ${line}`).join('\n'),
        },
      })
    },
  },
  {
    definition: {
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
    async execute(input) {
      const parsedInput = parseApplyPatchInput(input.call.input)
      const workspacePath = normalizeWorkspaceRelativePath(parsedInput.path)
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
          path: workspacePath,
          bytesChanged: Buffer.byteLength(parsedInput.newText, 'utf8') - Buffer.byteLength(parsedInput.oldText, 'utf8'),
        },
      })
    },
  },
  {
    definition: {
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
    async execute(input) {
      const parsedInput = parseWriteFileInput(input.call.input)
      const workspacePath = normalizeWorkspaceRelativePath(parsedInput.path)
      const resolvedPath = resolveWorkspacePath(input.settings.workspace.rootPath, parsedInput.path)

      await mkdir(path.dirname(resolvedPath), { recursive: true })
      await writeFile(resolvedPath, parsedInput.content, 'utf8')

      return createActionResult({
        actionCallId: input.call.id,
        status: 'completed',
        output: {
          path: workspacePath,
          bytesWritten: Buffer.byteLength(parsedInput.content, 'utf8'),
        },
      })
    },
  },
]
