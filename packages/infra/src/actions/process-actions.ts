import { spawn } from 'node:child_process'
import path from 'node:path'

import { normalizeWorkspaceRelativePath } from '@nano-harness/core'

import { createActionResult, type BuiltInActionCommand } from './types'
import { resolveWorkspacePath } from './workspace'

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

export const processActionCommands: BuiltInActionCommand[] = [
  {
    definition: {
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
    async execute(input) {
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
    },
  },
  {
    definition: {
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
    async execute(input) {
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
    },
  },
  {
    definition: {
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
    async execute(input) {
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
    },
  },
]
