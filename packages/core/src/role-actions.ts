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
  'get_current_time',
  'list_mcp_resources',
  'read_mcp_resource',
  'list_harness_components',
  'list_benchmark_results',
  'create_benchmark_run_plan',
  'create_benchmark_run_artifact',
  'write_benchmark_run_artifact',
  'compare_benchmark_results',
  'create_harness_promotion_artifact',
  'create_skill_improvement_artifact',
  'write_skill_improvement_artifact',
  'create_spec_artifact',
  'create_draft_pr_artifact',
  'list_spec_changes',
  'read_spec_artifact',
  'write_spec_artifact',
  'update_spec_task',
  'append_spec_evidence',
  'archive_spec_change',
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
  'get_current_time',
  'list_mcp_resources',
  'read_mcp_resource',
  'list_harness_components',
  'list_benchmark_results',
  'create_benchmark_run_plan',
  'create_benchmark_run_artifact',
  'write_benchmark_run_artifact',
  'compare_benchmark_results',
  'create_harness_promotion_artifact',
  'create_skill_improvement_artifact',
  'write_skill_improvement_artifact',
  'create_spec_artifact',
  'create_draft_pr_artifact',
  'list_spec_changes',
  'read_spec_artifact',
  'write_spec_artifact',
  'update_spec_task',
  'append_spec_evidence',
  'archive_spec_change',
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
