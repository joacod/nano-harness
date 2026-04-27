import type { ActionCall, ActionDefinition, AppSettings, Run } from '@nano-harness/shared'

export interface PolicyInput {
  run: Run
  action: ActionDefinition
  actionCall: ActionCall
  settings: AppSettings
}

export interface PolicyDecision {
  effect: 'allow' | 'deny' | 'require_approval'
  reason?: string
}

export interface Policy {
  evaluateAction(input: PolicyInput): Promise<PolicyDecision>
}

export class StaticPolicy implements Policy {
  async evaluateAction(input: PolicyInput): Promise<PolicyDecision> {
    if (input.settings.workspace.approvalPolicy === 'always') {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
      }
    }

    if (input.action.requiresApproval && input.settings.workspace.approvalPolicy === 'never') {
      return {
        effect: 'deny',
        reason: `${input.action.title} requires approval, but approvals are disabled in settings`,
      }
    }

    if (input.action.requiresApproval) {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
      }
    }

    return {
      effect: 'allow',
    }
  }
}
