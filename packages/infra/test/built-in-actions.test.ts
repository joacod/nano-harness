import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    requiresApproval: input.actionId === 'write_file',
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
