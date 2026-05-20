import { describe, expect, it } from 'vitest'

import { createProviderInstructions } from '../src'

describe('provider instructions', () => {
  it('builds shared workspace and tool-use guidance', () => {
    const instructions = createProviderInstructions({ workspaceRoot: '/workspace' })

    expect(instructions).toContain('You are Nano Harness, a local desktop coding assistant.')
    expect(instructions).toContain('Workspace root: /workspace.')
    expect(instructions).toContain('All file action paths must be relative to that workspace root.')
    expect(instructions).toContain('Use list_directory before assuming project or file paths')
    expect(instructions).toContain('If read_file fails because a path is missing')
  })

  it('adds role-specific instructions', () => {
    expect(createProviderInstructions({ workspaceRoot: '/workspace', role: 'plan' })).toContain('Plan mode')
    expect(createProviderInstructions({ workspaceRoot: '/workspace', role: 'review' })).toContain('Review mode')
    expect(createProviderInstructions({ workspaceRoot: '/workspace', role: 'plan' })).toContain('create_skill_improvement_artifact')
    expect(createProviderInstructions({ workspaceRoot: '/workspace', role: 'review' })).toContain('do not write skill files directly')
  })
})
