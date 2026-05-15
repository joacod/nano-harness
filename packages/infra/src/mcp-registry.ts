import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import type { ActionExecutionInput, ActionExecutor, McpRegistry } from '@nano-harness/core'
import { mcpInventorySchema, type ActionDefinition, type ActionResult, type AppSettings, type JsonValue, type McpInventory, type McpResource, type McpServerSettings, type McpTool } from '@nano-harness/shared'

const mcpRequestTimeoutMs = 5_000

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
    const liveInventories = await Promise.all(enabledServers.map(async (server) => getLiveInventory(server)))

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
      tools: enabledServers.flatMap((server, index) => [
        ...server.staticTools,
        ...liveInventories[index].tools,
      ].filter((tool) => server.allowedTools.includes(tool.name))),
      resources: enabledServers.flatMap((server, index) => [
        ...server.staticResources.map((resource) => ({
          serverId: resource.serverId,
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
        ...liveInventories[index].resources,
      ].filter((resource) => server.allowedResources.includes(resource.uri))),
    })
  }

  async readResource(input: { settings: AppSettings; serverId: string; uri: string }): Promise<{ content: string; mimeType?: string }> {
    const server = findEnabledServer(input.settings, input.serverId)

    if (!server.allowedResources.includes(input.uri)) {
      throw new Error(`MCP resource ${input.uri} is not allowed for server ${input.serverId}`)
    }

    const resource = server.staticResources.find((item) => item.uri === input.uri)

    if (resource) {
      return { content: resource.content, mimeType: resource.mimeType }
    }

    if (server.transport === 'stdio') {
      return await readStdioResource(server, input.uri)
    }

    throw new Error(`MCP resource ${input.uri} is not available from configured inventory`)
  }

  async invokeTool(input: { settings: AppSettings; serverId: string; toolName: string; arguments: Record<string, unknown> }): Promise<unknown> {
    const server = findEnabledServer(input.settings, input.serverId)

    if (!server.allowedTools.includes(input.toolName)) {
      throw new Error(`MCP tool ${input.toolName} is not allowed for server ${input.serverId}`)
    }

    if (server.transport === 'stdio') {
      return await invokeStdioTool(server, input.toolName, input.arguments)
    }

    throw new Error('MCP tool transport is not connected for this server')
  }
}

async function getLiveInventory(server: McpServerSettings): Promise<{ tools: McpTool[]; resources: McpResource[] }> {
  if (server.transport !== 'stdio' || !server.command) {
    return { tools: [], resources: [] }
  }

  try {
    return await withStdioMcpSession(server, async (session) => {
      const [toolsResult, resourcesResult] = await Promise.all([
        session.request('tools/list', {}),
        session.request('resources/list', {}),
      ])
      return {
        tools: parseMcpTools(server.id, toolsResult),
        resources: parseMcpResources(server.id, resourcesResult),
      }
    })
  } catch {
    return { tools: [], resources: [] }
  }
}

async function readStdioResource(server: McpServerSettings, uri: string): Promise<{ content: string; mimeType?: string }> {
  if (server.transport !== 'stdio' || !server.command) {
    throw new Error(`MCP server ${server.id} does not have a stdio command configured`)
  }

  return await withStdioMcpSession(server, async (session) => {
    const result = await session.request('resources/read', { uri })
    const content = parseResourceContent(result)

    if (!content) {
      throw new Error(`MCP resource ${uri} did not return text content`)
    }

    return content
  })
}

async function invokeStdioTool(server: McpServerSettings, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  if (server.transport !== 'stdio' || !server.command) {
    throw new Error(`MCP server ${server.id} does not have a stdio command configured`)
  }

  return await withStdioMcpSession(server, async (session) => session.request('tools/call', { name: toolName, arguments: args }))
}

async function withStdioMcpSession<T>(server: Extract<McpServerSettings, { transport: 'stdio' }>, run: (session: StdioMcpSession) => Promise<T>): Promise<T> {
  if (!server.command) {
    throw new Error(`MCP server ${server.id} does not have a command configured`)
  }

  const session = new StdioMcpSession(server.command, server.args)

  try {
    await session.initialize()
    return await run(session)
  } finally {
    session.close()
  }
}

class StdioMcpSession {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
  private buffer = Buffer.alloc(0)
  private nextId = 1

  constructor(command: string, args: string[]) {
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: {} })
    this.child.stdout.on('data', (chunk) => this.handleStdout(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    this.child.stderr.resume()
    this.child.on('error', (error) => this.rejectAll(error instanceof Error ? error : new Error('MCP server process failed')))
    this.child.on('exit', (code) => {
      if (this.pending.size > 0) {
        this.rejectAll(new Error(`MCP server exited before responding${code === null ? '' : ` with code ${code}`}`))
      }
    })
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nano-harness', version: '0.0.1' },
    })
    this.notify('notifications/initialized', {})
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    const message = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request ${method} timed out`))
      }, mcpRequestTimeoutMs)

      this.pending.set(id, { resolve, reject, timeout })
      this.writeMessage(message)
    })
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.writeMessage({ jsonrpc: '2.0', method, params })
  }

  close(): void {
    this.child.kill()
  }

  private writeMessage(message: Record<string, unknown>): void {
    const body = JSON.stringify(message)
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')

      if (headerEnd === -1) {
        return
      }

      const header = this.buffer.subarray(0, headerEnd).toString('utf8')
      const contentLength = parseContentLength(header)

      if (contentLength === null) {
        this.rejectAll(new Error('MCP response is missing Content-Length'))
        return
      }

      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength

      if (this.buffer.length < bodyEnd) {
        return
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8')
      this.buffer = this.buffer.subarray(bodyEnd)
      this.handleMessage(JSON.parse(body) as Record<string, unknown>)
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (typeof message.id !== 'number') {
      return
    }

    const pending = this.pending.get(message.id)

    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(message.id)

    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)))
      return
    }

    pending.resolve(message.result)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }

    this.pending.clear()
  }
}

function parseContentLength(header: string): number | null {
  const line = header.split('\r\n').find((item) => item.toLowerCase().startsWith('content-length:'))
  const value = line?.slice('content-length:'.length).trim()
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function parseMcpTools(serverId: string, value: unknown): McpTool[] {
  if (!isRecord(value) || !Array.isArray(value.tools)) {
    return []
  }

  return value.tools.filter(isRecord).flatMap((tool) => typeof tool.name === 'string' ? [{
    serverId,
    name: tool.name,
    ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
    ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
  }] : [])
}

function parseMcpResources(serverId: string, value: unknown): McpResource[] {
  if (!isRecord(value) || !Array.isArray(value.resources)) {
    return []
  }

  return value.resources.filter(isRecord).flatMap((resource) => typeof resource.uri === 'string' && typeof resource.name === 'string' ? [{
    serverId,
    uri: resource.uri,
    name: resource.name,
    ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
    ...(typeof resource.mimeType === 'string' ? { mimeType: resource.mimeType } : {}),
  }] : [])
}

function parseResourceContent(value: unknown): { content: string; mimeType?: string } | null {
  if (!isRecord(value) || !Array.isArray(value.contents)) {
    return null
  }

  const content = value.contents.filter(isRecord).find((item) => typeof item.text === 'string')

  return content && typeof content.text === 'string'
    ? { content: content.text, ...(typeof content.mimeType === 'string' ? { mimeType: content.mimeType } : {}) }
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
