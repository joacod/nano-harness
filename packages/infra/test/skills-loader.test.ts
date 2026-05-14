import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createDefaultProviderSettings, type AppSettings, type Message, type Run } from '@nano-harness/shared'

import { MarkdownSkillResolver } from '../src'

const cleanupPaths: string[] = []

const settings: AppSettings = {
  provider: createDefaultProviderSettings('openrouter'),
  workspace: {
    rootPath: '/workspace',
    approvalPolicy: 'on-request',
  },
}

const run: Run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  status: 'created',
  role: 'build',
  createdAt: '2026-04-29T10:00:00.000Z',
}

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((cleanupPath) => rm(cleanupPath, { recursive: true, force: true })))
})

describe('MarkdownSkillResolver', () => {
  it('loads bundled skills and selects enabled ones for each run', async () => {
    const resolver = new MarkdownSkillResolver({ userSkillsDir: '/missing/user/skills' })
    const context = await resolver.resolveForRun({
      settings,
      run,
      messages: [userMessage('Please help with this task')],
    })

    expect(context.available.map((skill) => skill.id)).toContain('repo-onboarding')
    expect(context.selected.map((skill) => skill.id)).toContain('repo-onboarding')
    expect(context.selected.map((skill) => skill.id)).toContain('typescript-refactor')
    expect(context.selected[0]?.content).toContain('package roots')
  })

  it('loads user and project SKILL.md files without executing code', async () => {
    const workspace = await createTempDir()
    const userSkillsDir = await createTempDir()
    await writeSkill(path.join(userSkillsDir, 'docs', 'SKILL.md'), {
      name: 'Docs Writer',
      description: 'Write docs safely.',
      triggers: 'docs, readme',
      tools: 'grep, read_range',
      safety: 'Do not invent references.',
      body: '# Docs Writer\nUse evidence from files.',
    })
    await writeSkill(path.join(workspace, '.nano', 'skills', 'release', 'SKILL.md'), {
      name: 'Release Notes',
      description: 'Prepare release notes.',
      triggers: 'release',
      tools: 'git_diff',
      safety: 'Check changed files first.',
      body: '# Release Notes\nSummarize user-facing changes.',
    })

    const resolver = new MarkdownSkillResolver({ userSkillsDir })
    const context = await resolver.resolveForRun({
      settings: { ...settings, workspace: { ...settings.workspace, rootPath: workspace } },
      run,
      messages: [userMessage('Draft release notes')],
    })

    expect(context.available.map((skill) => skill.id)).toEqual(expect.arrayContaining(['docs-writer', 'release-notes']))
    expect(context.selected.map((skill) => skill.id)).toContain('docs-writer')
    expect(context.selected.map((skill) => skill.id)).toContain('release-notes')
  })

  it('honors disabled skill ids from settings', async () => {
    const resolver = new MarkdownSkillResolver({ userSkillsDir: '/missing/user/skills' })
    const context = await resolver.resolveForRun({
      settings: { ...settings, skills: { disabledSkillIds: ['repo-onboarding'] } },
      run,
      messages: [userMessage('survey this repo')],
    })

    expect(context.available.find((skill) => skill.id === 'repo-onboarding')).toMatchObject({ enabled: false })
    expect(context.selected.map((skill) => skill.id)).not.toContain('repo-onboarding')
  })
})

function userMessage(content: string): Message {
  return {
    id: `message-${content}`,
    conversationId: 'conversation-1',
    runId: 'run-1',
    role: 'user',
    content,
    createdAt: '2026-04-29T10:00:00.000Z',
  }
}

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'nano-harness-skills-'))
  cleanupPaths.push(directory)
  return directory
}

async function writeSkill(filePath: string, input: {
  name: string
  description: string
  triggers: string
  tools: string
  safety: string
  body: string
}): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, [
    '---',
    `name: ${input.name}`,
    `description: ${input.description}`,
    `triggers: ${input.triggers}`,
    `tools: ${input.tools}`,
    `safety: ${input.safety}`,
    '---',
    input.body,
  ].join('\n'), 'utf8')
}
