import { describe, expect, it } from 'vitest'

import { DryRunPreviewBuilder, EmptyMcpRegistry, EmptySkillResolver } from '../src'
import { createActionDefinition, createActionResult, FakeActionExecutor, FakePolicy, FakeStore, testSettings } from './helpers'

describe('DryRunPreviewBuilder', () => {
  it('builds dry-run previews with role-filtered actions and safety metadata', async () => {
    const store = new FakeStore()
    const policy = new FakePolicy(() => ({ effect: 'require_approval', reason: 'Review first.' }))
    const builder = new DryRunPreviewBuilder({
      store,
      actionExecutor: new FakeActionExecutor([
        createActionDefinition({ id: 'read_file', title: 'Read File' }),
        createActionDefinition({ id: 'apply_patch', title: 'Apply Patch', requiresApproval: true }),
      ], async (input) => createActionResult({ actionCallId: input.call.id })),
      skillResolver: new EmptySkillResolver(),
      mcpRegistry: new EmptyMcpRegistry(),
      policy,
      hookRunner: {
        async listHooks() {
          return ['personal_rules.pre_tool_use']
        },
        async runHooks() {
          return []
        },
      },
      now: () => '2026-04-29T10:00:00.000Z',
    })

    const preview = await builder.build({
      settings: testSettings,
      run: {
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'created',
        role: 'plan',
        createdAt: '2026-04-29T10:00:00.000Z',
      },
      messages: [{
        id: 'message-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        role: 'user',
        content: 'Inspect the repo.',
        createdAt: '2026-04-29T10:00:00.000Z',
      }],
    })

    expect(preview.actions.map((action) => action.id)).toEqual(['read_file'])
    expect(policy.calls.map((call) => call.actionId)).toEqual(['read_file'])
    expect(preview.permissions.risky).toEqual([expect.objectContaining({ effect: 'require_approval' })])
    expect(preview.permissions.activeHooks).toEqual(['personal_rules.pre_tool_use'])
    expect(preview.mcp).toEqual({ servers: [], tools: [], resources: [] })
  })
})
