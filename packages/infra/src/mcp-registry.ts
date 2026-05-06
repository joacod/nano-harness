import type { ActionExecutionInput, ActionExecutor, McpRegistry } from '@nano-harness/core'
import { mcpInventorySchema, type ActionDefinition, type ActionResult, type AppSettings, type JsonValue, type McpInventory, type McpServerSettings } from '@nano-harness/shared'

const mcpActionDefinitions: Record<string, ActionDefinition> = {
  list_mcp_resources: {
    id: 'list_mcp_resources',
    title: 'List MCP Resources',
    description: 'List allow-listed resources from configured MCP servers.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string' } },
      additionalProperties: false,
    },
  },
  read_mcp_resource: {
    id: 'read_mcp_resource',
    title: 'Read MCP Resource',
    description: 'Read one allow-listed MCP resource.',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string' }, uri: { type: 'string' } },
      required: ['serverId', 'uri'],
      additionalProperties: false,
    },
  },
  invoke_mcp_tool: {
    id: 'invoke_mcp_tool',
    title: 'Invoke MCP Tool',
    description: 'Invoke an allow-listed MCP tool. This action is approval-gated.',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: { serverId: { type: 'string' }, toolName: { type: 'string' }, arguments: { type: 'object' } },
      required: ['serverId', 'toolName'],
      additionalProperties: false,
    },
  },
} satisfies Record<string, ActionDefinition>

export class ConfiguredMcpRegistry implements McpRegistry {
  async getInventory(settings: AppSettings): Promise<McpInventory> {
    const servers = settings.mcp?.servers ?? []
    const enabledServers = servers.filter((server) => server.enabled)

    return mcpInventorySchema.parse({
      servers: servers.map((server) => ({
        id: server.id,
        label: server.label,
        enabled: server.enabled,
        transport: server.transport,
        status: server.enabled ? isServerConfigured(server) ? 'configured' : 'unconfigured' : 'disabled',
        allowedTools: server.allowedTools,
        allowedResources: server.allowedResources,
      })),
      tools: enabledServers.flatMap((server) => server.staticTools.filter((tool) => server.allowedTools.includes(tool.name))),
      resources: enabledServers.flatMap((server) => server.staticResources
        .filter((resource) => server.allowedResources.includes(resource.uri))
        .map((resource) => ({
          serverId: resource.serverId,
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        }))),
    })
  }

  async readResource(input: { settings: AppSettings; serverId: string; uri: string }): Promise<{ content: string; mimeType?: string }> {
    const server = findEnabledServer(input.settings, input.serverId)

    if (!server.allowedResources.includes(input.uri)) {
      throw new Error(`MCP resource ${input.uri} is not allowed for server ${input.serverId}`)
    }

    const resource = server.staticResources.find((item) => item.uri === input.uri)

    if (!resource) {
      throw new Error(`MCP resource ${input.uri} is not available from configured static inventory`)
    }

    return { content: resource.content, mimeType: resource.mimeType }
  }

  async invokeTool(input: { settings: AppSettings; serverId: string; toolName: string; arguments: Record<string, unknown> }): Promise<unknown> {
    const server = findEnabledServer(input.settings, input.serverId)

    if (!server.allowedTools.includes(input.toolName)) {
      throw new Error(`MCP tool ${input.toolName} is not allowed for server ${input.serverId}`)
    }

    throw new Error('MCP tool transport is not connected yet; only inventory and resource inspection are available')
  }
}

export class McpActionExecutor implements ActionExecutor {
  constructor(private readonly registry: McpRegistry) {}

  async listDefinitions(): Promise<ActionDefinition[]> {
    return Object.values(mcpActionDefinitions)
  }

  async getDefinition(actionId: string): Promise<ActionDefinition | null> {
    return mcpActionDefinitions[actionId] ?? null
  }

  async execute(input: ActionExecutionInput): Promise<ActionResult> {
    try {
      switch (input.action.id) {
        case 'list_mcp_resources': {
          const serverId = typeof input.call.input.serverId === 'string' ? input.call.input.serverId : undefined
          const inventory = await this.registry.getInventory(input.settings)
          const resources = serverId ? inventory.resources.filter((resource) => resource.serverId === serverId) : inventory.resources
          return createActionResult(input.call.id, 'completed', { resources })
        }
        case 'read_mcp_resource': {
          const { serverId, uri } = parseResourceInput(input.call.input)
          const resource = await this.registry.readResource({ settings: input.settings, serverId, uri })
          return createActionResult(input.call.id, 'completed', { serverId, uri, ...resource })
        }
        case 'invoke_mcp_tool': {
          const { serverId, toolName, args } = parseToolInput(input.call.input)
          const output = await this.registry.invokeTool({ settings: input.settings, serverId, toolName, arguments: args })
          return createActionResult(input.call.id, 'completed', {
            serverId,
            toolName,
            output: JSON.parse(JSON.stringify(output)) as JsonValue,
          })
        }
        default:
          return createActionResult(input.call.id, 'failed', undefined, `Unsupported action ${input.action.id}`)
      }
    } catch (error) {
      return createActionResult(input.call.id, 'failed', undefined, error instanceof Error ? error.message : 'Unknown MCP action failure')
    }
  }
}

function isServerConfigured(server: McpServerSettings): boolean {
  return server.transport === 'http' ? Boolean(server.url) : Boolean(server.command)
}

function findEnabledServer(settings: AppSettings, serverId: string) {
  const server = settings.mcp?.servers.find((item) => item.id === serverId)

  if (!server || !server.enabled) {
    throw new Error(`MCP server ${serverId} is not enabled`)
  }

  return server
}

function parseResourceInput(value: Record<string, unknown>): { serverId: string; uri: string } {
  if (typeof value.serverId !== 'string' || !value.serverId.trim()) {
    throw new Error('read_mcp_resource requires serverId')
  }

  if (typeof value.uri !== 'string' || !value.uri.trim()) {
    throw new Error('read_mcp_resource requires uri')
  }

  return { serverId: value.serverId, uri: value.uri }
}

function parseToolInput(value: Record<string, unknown>): { serverId: string; toolName: string; args: Record<string, unknown> } {
  if (typeof value.serverId !== 'string' || !value.serverId.trim()) {
    throw new Error('invoke_mcp_tool requires serverId')
  }

  if (typeof value.toolName !== 'string' || !value.toolName.trim()) {
    throw new Error('invoke_mcp_tool requires toolName')
  }

  const args = typeof value.arguments === 'object' && value.arguments !== null && !Array.isArray(value.arguments)
    ? value.arguments as Record<string, unknown>
    : {}

  return { serverId: value.serverId, toolName: value.toolName, args }
}

function createActionResult(actionCallId: string, status: ActionResult['status'], output?: ActionResult['output'], errorMessage?: string): ActionResult {
  return {
    id: `${actionCallId}-result`,
    actionCallId,
    status,
    output,
    errorMessage,
    completedAt: new Date().toISOString(),
  }
}
