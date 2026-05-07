import type { ActionDefinition, Run } from '@nano-harness/shared'

const planAllowedActions = new Set([
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
  'list_harness_components',
  'compare_benchmark_results',
  'create_spec_artifact',
  'create_draft_pr_artifact',
])

const reviewAllowedActions = new Set([
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
  'list_harness_components',
  'compare_benchmark_results',
  'create_spec_artifact',
  'create_draft_pr_artifact',
])

export function isActionAllowedForRole(role: Run['role'], actionId: string): boolean {
  if (!role || role === 'build') {
    return true
  }

  return role === 'plan' ? planAllowedActions.has(actionId) : reviewAllowedActions.has(actionId)
}

export function filterActionsForRole(actions: ActionDefinition[], role: Run['role']): ActionDefinition[] {
  return actions.filter((action) => isActionAllowedForRole(role, action.id))
}
