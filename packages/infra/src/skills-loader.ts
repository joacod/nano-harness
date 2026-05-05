import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { SkillResolver } from '@nano-harness/core'
import { skillContextSchema, skillPackageSchema, type AppSettings, type Message, type Run, type SkillPackage, type SkillSummary } from '@nano-harness/shared'

const bundledSkills: SkillPackage[] = [
  skillPackageSchema.parse({
    id: 'repo-onboarding',
    name: 'Repo Onboarding',
    description: 'Survey an unfamiliar repository before changing code.',
    triggers: ['repo', 'repository', 'onboard', 'survey', 'architecture', 'where is'],
    tools: ['list_directory', 'glob', 'grep', 'read_range'],
    safetyNotes: ['Do not edit files during onboarding unless the user explicitly asks for changes.'],
    source: 'bundled',
    enabled: true,
    content: [
      'Start by identifying package roots, entry points, and test commands.',
      'Use search and bounded reads before making claims about structure.',
      'Summarize findings with file references and call out uncertainty.',
    ].join('\n'),
  }),
  skillPackageSchema.parse({
    id: 'typescript-refactor',
    name: 'TypeScript Refactor',
    description: 'Make small TypeScript refactors with validation and minimal diffs.',
    triggers: ['typescript', 'refactor', 'typecheck', 'ts'],
    tools: ['grep', 'read_range', 'apply_patch', 'run_command'],
    safetyNotes: ['Prefer minimal patches and run typecheck or targeted tests after edits.'],
    source: 'bundled',
    enabled: true,
    content: [
      'Find all relevant call sites before editing shared contracts.',
      'Use exact patch edits when possible instead of rewriting whole files.',
      'Run targeted tests or typecheck after changing types or public contracts.',
    ].join('\n'),
  }),
]

type SkillLoaderOptions = {
  userSkillsDir?: string
}

export class MarkdownSkillResolver implements SkillResolver {
  private readonly userSkillsDir: string

  constructor(options: SkillLoaderOptions = {}) {
    this.userSkillsDir = options.userSkillsDir ?? path.join(os.homedir(), '.nano', 'skills')
  }

  async resolveForRun(input: { settings: AppSettings; run?: Run; messages: Message[] }) {
    const skills = await this.listSkills(input.settings)
    const promptText = input.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n').toLowerCase()
    const selected = skills.filter((skill) => skill.enabled && isSkillRelevant(skill, promptText))

    return skillContextSchema.parse({
      available: skills.map(toSummary),
      selected,
    })
  }

  async listSkills(settings: AppSettings): Promise<SkillPackage[]> {
    const disabledIds = new Set(settings.skills?.disabledSkillIds ?? [])
    const projectSkillsDir = path.join(settings.workspace.rootPath, '.nano', 'skills')
    const discovered = [
      ...bundledSkills,
      ...(await readSkillsDirectory(this.userSkillsDir, 'user')),
      ...(await readSkillsDirectory(projectSkillsDir, 'project')),
    ]
    const deduped = new Map<string, SkillPackage>()

    for (const skill of discovered) {
      deduped.set(skill.id, {
        ...skill,
        enabled: !disabledIds.has(skill.id),
      })
    }

    return [...deduped.values()].sort((left, right) => left.name.localeCompare(right.name))
  }
}

function toSummary(skill: SkillPackage): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    triggers: skill.triggers,
    tools: skill.tools,
    safetyNotes: skill.safetyNotes,
    source: skill.source,
    path: skill.path,
    enabled: skill.enabled,
  }
}

function isSkillRelevant(skill: SkillPackage, promptText: string): boolean {
  if (!promptText.trim()) {
    return false
  }

  const needles = [skill.id, skill.name, ...skill.triggers].map((value) => value.toLowerCase())
  return needles.some((needle) => promptText.includes(needle))
}

async function readSkillsDirectory(directoryPath: string, source: 'user' | 'project'): Promise<SkillPackage[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>

  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }

  const skills: SkillPackage[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const skillPath = path.join(directoryPath, entry.name, 'SKILL.md')

    try {
      skills.push(parseSkillMarkdown(await readFile(skillPath, 'utf8'), source, skillPath, entry.name))
    } catch {
      // Invalid local skills are ignored so one broken file cannot block a run.
    }
  }

  return skills
}

function parseSkillMarkdown(markdown: string, source: 'user' | 'project', skillPath: string, fallbackId: string): SkillPackage {
  const trimmed = markdown.trim()
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(trimmed)
  const metadata = frontmatterMatch ? parseFrontmatter(frontmatterMatch[1]) : {}
  const content = (frontmatterMatch ? frontmatterMatch[2] : trimmed).trim()
  const name = metadata.name ?? firstHeading(content) ?? fallbackId
  const id = metadata.id ?? slugify(name)

  return skillPackageSchema.parse({
    id,
    name,
    description: metadata.description ?? `Skill loaded from ${source} skills.`,
    triggers: parseList(metadata.triggers),
    tools: parseList(metadata.tools),
    safetyNotes: parseList(metadata.safetyNotes ?? metadata.safety),
    source,
    path: skillPath,
    enabled: true,
    content,
  })
}

function parseFrontmatter(value: string): Record<string, string> {
  const metadata: Record<string, string> = {}

  for (const line of value.split('\n')) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    metadata[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim()
  }

  return metadata
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function firstHeading(markdown: string): string | null {
  return markdown.split('\n').find((line) => line.startsWith('# '))?.slice(2).trim() ?? null
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill'
}

export { bundledSkills }
