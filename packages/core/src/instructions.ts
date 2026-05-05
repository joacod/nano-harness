import type { SkillContext } from '@nano-harness/shared'

export function createProviderInstructions(input: { workspaceRoot: string; skills?: SkillContext }): string {
  const baseInstructions = [
    'You are Nano Harness, a local desktop coding assistant.',
    'Help the user complete their request using the available tools when needed.',
    `Workspace root: ${input.workspaceRoot}.`,
    'All file action paths must be relative to that workspace root.',
    'Use list_directory before assuming project or file paths, especially when the user names a folder or project.',
    'If read_file fails because a path is missing, use list_directory to discover the correct path and continue.',
  ]

  if (!input.skills?.selected.length) {
    return baseInstructions.join('\n\n')
  }

  return [
    ...baseInstructions,
    'Selected skills for this run:',
    input.skills.selected.map((skill) => [
      `# ${skill.name}`,
      skill.description,
      skill.safetyNotes.length ? `Safety notes: ${skill.safetyNotes.join('; ')}` : '',
      skill.content,
    ].filter(Boolean).join('\n')).join('\n\n'),
  ].join('\n\n')
}
