import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ActionExecutionInput, ActionExecutor } from '@nano-harness/core'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

function parseReadFileInput(value: Record<string, unknown>): { path: string } {
  if (typeof value.path !== 'string' || !value.path.trim()) {
    throw new Error('read_file requires a non-empty string path')
  }

  return { path: value.path }
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
