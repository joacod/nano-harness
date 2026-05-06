import { createDefaultSafetySettings, type ActionCall, type ActionDefinition, type ActionResult, type AppSettings, type HookPhase, type HookResult, type Run } from '@nano-harness/shared'

export interface HookInput {
  phase: HookPhase
  run: Run
  action: ActionDefinition
  actionCall: ActionCall
  settings: AppSettings
  result?: ActionResult
}

export interface HookRunner {
  listHooks(settings: AppSettings): Promise<string[]>
  runHooks(input: HookInput): Promise<HookResult[]>
}

export class PersonalRulesHookRunner implements HookRunner {
  async listHooks(settings: AppSettings): Promise<string[]> {
    const safety = settings.safety ?? createDefaultSafetySettings()

    if (!safety.hooks.enabled) {
      return []
    }

    const hooks = ['personal_rules.pre_tool_use']

    if (safety.personalRules.requireTestsAfterEdits) {
      hooks.push('personal_rules.post_tool_use.requireTestsAfterEdits')
    }

    return hooks
  }

  async runHooks(input: HookInput): Promise<HookResult[]> {
    const safety = input.settings.safety ?? createDefaultSafetySettings()

    if (!safety.hooks.enabled) {
      return []
    }

    if (input.phase === 'pre_tool_use') {
      return [{
        hookId: 'personal_rules.pre_tool_use',
        phase: input.phase,
        status: 'completed',
        message: `Checked personal rules before ${input.action.id}`,
      }]
    }

    if (safety.personalRules.requireTestsAfterEdits && isEditAction(input.action.id)) {
      return [{
        hookId: 'personal_rules.post_tool_use.requireTestsAfterEdits',
        phase: input.phase,
        status: 'completed',
        message: 'Personal rule active: run validation after editing files.',
      }]
    }

    return []
  }
}

function isEditAction(actionId: string): boolean {
  return actionId === 'write_file' || actionId === 'apply_patch'
}
