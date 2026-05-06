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
    requiresApproval: input.actionId === 'write_file' || input.actionId === 'apply_patch' || input.actionId === 'run_command',
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

async function createWorkspace(): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'nano-harness-actions-'))
  cleanupPaths.push(rootPath)
  return rootPath
}
