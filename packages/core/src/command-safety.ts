import type { PermissionPreview } from '@nano-harness/shared'

const dangerousCommands = new Set(['rm', 'sudo', 'chmod', 'chown', 'curl', 'wget'])
const allowedLocalCommands = new Set(['pnpm', 'npm', 'node', 'git', 'tsc', 'vitest', 'ls', 'pwd'])
const safeGitSubcommands = new Set(['status', 'diff', 'log', 'show'])
const riskyGitSubcommands = new Set(['push', 'reset', 'checkout', 'restore', 'clean', 'rebase', 'commit'])
const validationPnpmScripts = new Set(['test', 'typecheck', 'lint', 'build', 'test:e2e'])

export function isShellPathCommand(command: string): boolean {
  return command.includes('/') || command.includes('\\')
}

export function isDangerousCommand(command: string): boolean {
  return dangerousCommands.has(command)
}

export function isAllowedLocalCommand(command: string): boolean {
  return allowedLocalCommands.has(command) && !isShellPathCommand(command)
}

export function isRiskyGitSubcommand(command: string, args: string[]): boolean {
  return command === 'git' && riskyGitSubcommands.has(args[0] ?? '')
}

export function classifyCommand(command: string, args: string[]): PermissionPreview['classification'] {
  if (!command || isShellPathCommand(command) || isDangerousCommand(command) || !isAllowedLocalCommand(command)) {
    return 'denied'
  }

  if (command === 'git' && safeGitSubcommands.has(args[0] ?? 'status')) {
    return 'safe_inspection'
  }

  if (['tsc', 'vitest'].includes(command) || (command === 'pnpm' && validationPnpmScripts.has(args[0] ?? ''))) {
    return 'validation'
  }

  if (['pnpm', 'npm', 'node', 'git'].includes(command)) {
    return 'risky_mutation'
  }

  return 'safe_inspection'
}

export function getCommandDenialRule(command: string, personalDeniedCommands: string[] = []): string | null {
  const personalDenied = new Set(personalDeniedCommands)

  if (!command) {
    return 'commands.deny_shell_paths'
  }

  if (isShellPathCommand(command)) {
    return 'commands.deny_shell_paths'
  }

  if (isDangerousCommand(command) || personalDenied.has(command)) {
    return 'commands.deny_dangerous'
  }

  if (!isAllowedLocalCommand(command)) {
    return 'commands.deny_unlisted'
  }

  return null
}

export function assertAllowedLocalCommand(command: string): void {
  if (!isAllowedLocalCommand(command)) {
    throw new Error(`Command ${command} is not in the allow-list`)
  }
}
