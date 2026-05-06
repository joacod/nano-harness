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
    const roleDecision = evaluateRolePolicy(input.run.role, input.action)

    if (roleDecision) {
      return roleDecision
    }

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

function evaluateRolePolicy(role: Run['role'], action: ActionDefinition): PolicyDecision | null {
  if (!role || role === 'build') {
    return null
  }

  const planAllowed = new Set([
    'list_directory',
    'read_file',
    'read_range',
    'glob',
    'grep',
    'git_status',
    'git_diff',
    'fetch_url',
    'list_mcp_resources',
    'read_mcp_resource',
  ])
  const reviewAllowed = new Set([
    'list_directory',
    'read_file',
    'read_range',
    'glob',
    'grep',
    'git_status',
    'git_diff',
    'run_command',
    'list_mcp_resources',
    'read_mcp_resource',
  ])
  const allowed = role === 'plan' ? planAllowed : reviewAllowed

  if (allowed.has(action.id)) {
    return null
  }

  return {
    effect: 'deny',
    reason: `${action.title} is not allowed in ${role} mode`,
  }
}
