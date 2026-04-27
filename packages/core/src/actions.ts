import type { ActionCall, ActionDefinition, ActionResult, AppSettings, Run } from '@nano-harness/shared'

export interface ActionExecutionInput {
  run: Run
  action: ActionDefinition
  call: ActionCall
  settings: AppSettings
  signal: AbortSignal
}

export interface ActionExecutor {
  listDefinitions(): Promise<ActionDefinition[]>
  getDefinition(actionId: string): Promise<ActionDefinition | null>
  execute(input: ActionExecutionInput): Promise<ActionResult>
}
