import type { ActionExecutionInput } from '@nano-harness/core'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

export interface BuiltInActionCommand {
  definition: ActionDefinition
  execute(input: ActionExecutionInput): Promise<ActionResult>
}

export function createActionResult(input: {
  actionCallId: string
  status: ActionResult['status']
  output?: ActionResult['output']
  errorMessage?: string
}): ActionResult {
  return {
    id: `${input.actionCallId}-result`,
    actionCallId: input.actionCallId,
    status: input.status,
    output: input.output,
    errorMessage: input.errorMessage,
    completedAt: new Date().toISOString(),
  }
}
