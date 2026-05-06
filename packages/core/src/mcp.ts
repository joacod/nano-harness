import type { AppSettings, McpInventory } from '@nano-harness/shared'

export interface McpRegistry {
  getInventory(settings: AppSettings): Promise<McpInventory>
  readResource(input: { settings: AppSettings; serverId: string; uri: string }): Promise<{ content: string; mimeType?: string }>
  invokeTool(input: { settings: AppSettings; serverId: string; toolName: string; arguments: Record<string, unknown> }): Promise<unknown>
}

export class EmptyMcpRegistry implements McpRegistry {
  async getInventory(): Promise<McpInventory> {
    return { servers: [], tools: [], resources: [] }
  }

  async readResource(): Promise<{ content: string; mimeType?: string }> {
    throw new Error('No MCP registry is configured')
  }

  async invokeTool(): Promise<unknown> {
    throw new Error('No MCP registry is configured')
  }
}
