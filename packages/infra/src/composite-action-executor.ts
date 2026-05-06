import type { ActionExecutionInput, ActionExecutor } from '@nano-harness/core'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

export class CompositeActionExecutor implements ActionExecutor {
  constructor(private readonly executors: ActionExecutor[]) {}

  async listDefinitions(): Promise<ActionDefinition[]> {
    const definitions = await Promise.all(this.executors.map((executor) => executor.listDefinitions()))
    return definitions.flat()
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    for (const executor of this.executors) {
      const definition = await executor.getDefinition(actionId)

      if (definition) {
        return definition
      }
    }

    return null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    for (const executor of this.executors) {
      const definition = await executor.getDefinition(input.action.id)

      if (definition) {
        return await executor.execute(input)
      }
    }

    return {
      id: `${input.call.id}-result`,
      actionCallId: input.call.id,
      status: 'failed',
      errorMessage: `Unsupported action ${input.action.id}`,
      completedAt: new Date().toISOString(),
    }
  }
}
