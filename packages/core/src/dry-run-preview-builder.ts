import type { AppSettings, ActionDefinition, PermissionDecision, Run, RunEvent, Message } from '@nano-harness/shared'
import { getProviderDefinition } from '@nano-harness/shared'

import type { ActionExecutor } from './actions'
import type { HookRunner } from './hooks'
import type { McpRegistry } from './mcp'
import type { Policy } from './policy'
import { listActiveSafetyRules } from './policy'
import type { SkillResolver } from './provider'
import { filterActionsForRole } from './role-actions'
import type { Store } from './store'

export type DryRunPreviewPayload = Extract<RunEvent, { type: 'run.dry_run_preview' }>['payload']

export interface DryRunPreviewBuilderDependencies {
  store: Store
  actionExecutor: ActionExecutor
  skillResolver: SkillResolver
  mcpRegistry: McpRegistry
  policy: Policy
  hookRunner: HookRunner
  now: () => string
}

export class DryRunPreviewBuilder {
  constructor(private readonly dependencies: DryRunPreviewBuilderDependencies) {}

  async build(input: { settings: AppSettings; run: Run; messages: Message[] }): Promise<DryRunPreviewPayload> {
    const { settings, run, messages } = input
    const actions = filterActionsForRole(await this.dependencies.actionExecutor.listDefinitions(), run.role)
    const skills = await this.dependencies.skillResolver.resolveForRun({ settings, run, messages })
    const mcp = await this.dependencies.mcpRegistry.getInventory(settings)
    const memory = await this.dependencies.store.recallMemory({ query: messages.map((message) => message.content).join('\n'), settings })
    const permissionDecisions = await Promise.all(actions.map(async (action) => {
      const decision = await this.dependencies.policy.evaluateAction({
        run,
        action,
        actionCall: {
          id: `dry-run-${action.id}`,
          runId: run.id,
          actionId: action.id,
          input: {},
          requestedAt: this.dependencies.now(),
        },
        settings,
      })

      return normalizeDryRunDecision({ action, settings, decision })
    }))

    return {
      provider: {
        provider: settings.provider.provider,
        model: settings.provider.model,
        baseUrl: settings.provider.baseUrl ?? getProviderDefinition(settings.provider.provider).baseUrl,
      },
      workspace: {
        rootPath: settings.workspace.rootPath,
        approvalPolicy: settings.workspace.approvalPolicy,
      },
      actions: actions.map((action) => ({
        id: action.id,
        title: action.title,
        requiresApproval: action.requiresApproval,
      })),
      permissions: {
        denied: permissionDecisions.filter((decision) => decision.effect === 'deny'),
        risky: permissionDecisions.filter((decision) => decision.effect === 'require_approval'),
        activeRules: listActiveSafetyRules(settings),
        activeHooks: await this.dependencies.hookRunner.listHooks(settings),
      },
      skills: {
        available: skills.available,
        selected: skills.selected.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          triggers: skill.triggers,
          tools: skill.tools,
          safetyNotes: skill.safetyNotes,
          source: skill.source,
          path: skill.path,
          enabled: skill.enabled,
          validationWarnings: skill.validationWarnings,
        })),
      },
      mcp,
      memory,
    }
  }
}

function normalizeDryRunDecision(input: { action: ActionDefinition; settings: AppSettings; decision: PermissionDecision }): PermissionDecision {
  const { action, settings, decision } = input

  if (action.id !== 'run_command' || decision.effect !== 'deny' || decision.reason !== 'Command (missing) is denied by safety policy') {
    return decision
  }

  const preview = {
    summary: action.title,
    classification: 'risky_mutation' as const,
  }

  if (settings.workspace.approvalPolicy === 'never') {
    return {
      effect: 'deny',
      reason: `${action.title} requires approval, but approvals are disabled in settings`,
      matchedRule: 'approval_policy.never',
      preview,
    }
  }

  return {
    effect: 'require_approval',
    reason: `Approval required for ${action.title}`,
    matchedRule: settings.workspace.approvalPolicy === 'always' ? 'approval_policy.always' : 'action.requires_approval',
    preview,
  }
}
