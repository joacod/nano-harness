import type { ActionExecutionInput, ActionExecutor } from '@nano-harness/core'
import type { ActionDefinition, ActionResult } from '@nano-harness/shared'

import { artifactActionCommands } from './actions/artifact-actions'
import { fileActionCommands } from './actions/file-actions'
import { networkActionCommands } from './actions/network-actions'
import { processActionCommands } from './actions/process-actions'
import { searchActionCommands } from './actions/search-actions'
import { createActionResult, type BuiltInActionCommand } from './actions/types'

const actionDefinitions: Record<string, ActionDefinition> = {
  ...Object.fromEntries(fileActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(searchActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(networkActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(processActionCommands.map((command) => [command.definition.id, command.definition])),
  ...Object.fromEntries(artifactActionCommands.map((command) => [command.definition.id, command.definition])),
} satisfies Record<string, ActionDefinition>

const commandRegistry = new Map<string, BuiltInActionCommand>([
  ...fileActionCommands,
  ...searchActionCommands,
  ...networkActionCommands,
  ...processActionCommands,
  ...artifactActionCommands,
].map((command) => [command.definition.id, command]))

export class BuiltInActionExecutor implements ActionExecutor {
  async listDefinitions(): Promise<ActionDefinition[]> {
    return builtInActionDefinitions
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    return actionDefinitions[actionId] ?? null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    try {
      const command = commandRegistry.get(input.action.id)

      if (command) {
        return await command.execute(input)
      }

      return createActionResult({
        actionCallId: input.call.id,
        status: 'failed',
        errorMessage: `Unsupported action ${input.action.id}`,
      })
    } catch (error) {
      return createActionResult({
        actionCallId: input.call.id,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown action failure',
      })
    }
  }
}

export const builtInActionDefinitions = Object.values(actionDefinitions)
