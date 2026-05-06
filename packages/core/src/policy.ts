import { createDefaultSafetySettings, type ActionCall, type ActionDefinition, type AppSettings, type PermissionDecision, type PermissionPreview, type Run } from '@nano-harness/shared'

export interface PolicyInput {
  run: Run
  action: ActionDefinition
  actionCall: ActionCall
  settings: AppSettings
}

export type PolicyDecision = PermissionDecision

export interface Policy {
  evaluateAction(input: PolicyInput): Promise<PolicyDecision>
}

export class StaticPolicy implements Policy {
  async evaluateAction(input: PolicyInput): Promise<PolicyDecision> {
    const centralDecision = evaluateCentralPermission(input)

    if (centralDecision.effect !== 'allow') {
      return centralDecision
    }

    const roleDecision = evaluateRolePolicy(input.run.role, input.action)

    if (roleDecision) {
      return roleDecision
    }

    if (input.settings.workspace.approvalPolicy === 'always') {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
        matchedRule: 'approval_policy.always',
        preview: centralDecision.preview,
      }
    }

    if (input.action.requiresApproval && input.settings.workspace.approvalPolicy === 'never') {
      return {
        effect: 'deny',
        reason: `${input.action.title} requires approval, but approvals are disabled in settings`,
        matchedRule: 'approval_policy.never',
        preview: centralDecision.preview,
      }
    }

    if (input.action.requiresApproval) {
      return {
        effect: 'require_approval',
        reason: `Approval required for ${input.action.title}`,
        matchedRule: 'action.requires_approval',
        preview: centralDecision.preview,
      }
    }

    return {
      effect: 'allow',
      preview: centralDecision.preview,
    }
  }
}

export function evaluateCentralPermission(input: PolicyInput): PolicyDecision {
  const safety = input.settings.safety ?? createDefaultSafetySettings()
  const blockedAction = safety.personalRules.blockedActions.find((actionId) => actionId === input.action.id)
  const preview = createPermissionPreview(input)

  if (blockedAction) {
    return {
      effect: 'deny',
      reason: `${input.action.title} is blocked by a personal safety rule`,
      matchedRule: `personal_rules.blockedActions.${blockedAction}`,
      preview,
    }
  }

  const pathDecision = evaluateWorkspaceBoundary(input, preview)

  if (pathDecision) {
    return pathDecision
  }

  const commandDecision = evaluateCommandPermission(input, preview)

  if (commandDecision) {
    return commandDecision
  }

  return {
    effect: 'allow',
    preview,
  }
}

export function listActiveSafetyRules(settings: AppSettings): string[] {
  const safety = settings.safety ?? createDefaultSafetySettings()
  const rules = [
    'workspace_boundary.reads_and_writes',
    'commands.deny_dangerous',
    'commands.classify_risky_mutation',
  ]

  if (safety.personalRules.neverWriteOutsideWorkspace) {
    rules.push('personal_rules.neverWriteOutsideWorkspace')
  }

  if (safety.personalRules.requireTestsAfterEdits) {
    rules.push('personal_rules.requireTestsAfterEdits')
  }

  rules.push(...safety.personalRules.blockedActions.map((actionId) => `personal_rules.blockedActions.${actionId}`))
  rules.push(...safety.personalRules.deniedCommands.map((command) => `personal_rules.deniedCommands.${command}`))

  return rules
}

function evaluateWorkspaceBoundary(input: PolicyInput, preview: PermissionPreview): PolicyDecision | null {
  const pathValue = getPathInput(input.action.id, input.actionCall.input)

  if (!pathValue) {
    return null
  }

  if (!isInsideWorkspace(input.settings.workspace.rootPath, pathValue)) {
    return {
      effect: 'deny',
      reason: `${input.action.title} target is outside the configured workspace root`,
      matchedRule: 'workspace_boundary.reads_and_writes',
      preview,
    }
  }

  return null
}

function evaluateCommandPermission(input: PolicyInput, preview: PermissionPreview): PolicyDecision | null {
  if (input.action.id !== 'run_command') {
    return null
  }

  const command = typeof input.actionCall.input.command === 'string' ? input.actionCall.input.command : ''
  const args = Array.isArray(input.actionCall.input.args)
    ? input.actionCall.input.args.filter((arg): arg is string => typeof arg === 'string')
    : []
  const safety = input.settings.safety ?? createDefaultSafetySettings()
  const deniedCommands = new Set(['rm', 'sudo', 'chmod', 'chown', 'curl', 'wget', ...safety.personalRules.deniedCommands])
  const gitSubcommand = command === 'git' ? args[0] : undefined

  if (!command || command.includes('/') || command.includes('\\') || deniedCommands.has(command)) {
    return {
      effect: 'deny',
      reason: `Command ${command || '(missing)'} is denied by safety policy`,
      matchedRule: deniedCommands.has(command) ? 'commands.deny_dangerous' : 'commands.deny_shell_paths',
      preview,
    }
  }

  if (gitSubcommand && ['push', 'reset', 'checkout', 'restore', 'clean', 'rebase', 'commit'].includes(gitSubcommand)) {
    return {
      effect: 'require_approval',
      reason: `git ${gitSubcommand} is a risky repository mutation`,
      matchedRule: 'commands.classify_risky_mutation',
      preview,
    }
  }

  if (preview.classification === 'risky_mutation') {
    return {
      effect: 'require_approval',
      reason: `${command} may mutate the workspace`,
      matchedRule: 'commands.classify_risky_mutation',
      preview,
    }
  }

  return null
}

function createPermissionPreview(input: PolicyInput): PermissionPreview {
  if (input.action.id === 'run_command') {
    const command = typeof input.actionCall.input.command === 'string' ? input.actionCall.input.command : '(missing)'
    const args = Array.isArray(input.actionCall.input.args)
      ? input.actionCall.input.args.filter((arg): arg is string => typeof arg === 'string')
      : []

    return {
      summary: `Run ${[command, ...args].join(' ')}`,
      command,
      classification: classifyCommand(command, args),
    }
  }

  const pathValue = getPathInput(input.action.id, input.actionCall.input)

  return {
    summary: `${input.action.title}${pathValue ? ` on ${pathValue}` : ''}`,
    path: pathValue,
    classification: input.action.requiresApproval ? 'risky_mutation' : 'safe_inspection',
  }
}

function classifyCommand(command: string, args: string[]): PermissionPreview['classification'] {
  if (!command || command.includes('/') || command.includes('\\') || ['rm', 'sudo', 'chmod', 'chown', 'curl', 'wget'].includes(command)) {
    return 'denied'
  }

  if (command === 'git' && ['status', 'diff', 'log', 'show'].includes(args[0] ?? 'status')) {
    return 'safe_inspection'
  }

  if (['tsc', 'vitest'].includes(command) || (command === 'pnpm' && ['test', 'typecheck', 'lint', 'build', 'test:e2e'].includes(args[0] ?? ''))) {
    return 'validation'
  }

  if (['pnpm', 'npm', 'node', 'git'].includes(command)) {
    return 'risky_mutation'
  }

  return 'safe_inspection'
}

function getPathInput(actionId: string, input: ActionCall['input']): string | undefined {
  if (actionId === 'run_command') {
    return typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : '.'
  }

  if (['list_directory', 'read_file', 'read_range', 'apply_patch', 'write_file'].includes(actionId)) {
    return typeof input.path === 'string' && input.path.trim() ? input.path : actionId === 'list_directory' ? '.' : undefined
  }

  return undefined
}

function isInsideWorkspace(rootPath: string, targetPath: string): boolean {
  const normalizedTarget = targetPath.replace(/\\/g, '/')
  const normalizedRoot = rootPath.replace(/\\/g, '/')

  if (normalizedTarget.startsWith('/')) {
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`)
  }

  const segments = normalizedTarget.split('/').filter((segment) => segment && segment !== '.')
  let depth = 0

  for (const segment of segments) {
    if (segment === '..') {
      depth -= 1
    } else {
      depth += 1
    }

    if (depth < 0) {
      return false
    }
  }

  return true
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
    'list_harness_components',
    'compare_benchmark_results',
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
    'list_harness_components',
    'compare_benchmark_results',
  ])
  const allowed = role === 'plan' ? planAllowed : reviewAllowed

  if (allowed.has(action.id)) {
    return null
  }

  return {
    effect: 'deny',
    reason: `${action.title} is not allowed in ${role} mode`,
    matchedRule: `role.${role}.allowedActions`,
  }
}
