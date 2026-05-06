import { describe, expect, it } from 'vitest'

import { createDefaultProviderSettings, type AppSettings } from '@nano-harness/shared'

import { ConfiguredMcpRegistry, McpActionExecutor } from '../src'

const settings: AppSettings = {
  provider: createDefaultProviderSettings('openrouter'),
  workspace: { rootPath: '/workspace', approvalPolicy: 'on-request' },
  mcp: {
    servers: [
      {
        id: 'docs',
        label: 'Docs Server',
        enabled: true,
        transport: 'stdio',
        command: 'docs-mcp',
        args: [],
        allowedTools: ['search_docs'],
        allowedResources: ['docs://intro'],
        staticResources: [
          {
            serverId: 'docs',
            uri: 'docs://intro',
            name: 'Intro',
            mimeType: 'text/markdown',
            content: '# Intro',
          },
          {
            serverId: 'docs',
            uri: 'docs://secret',
            name: 'Secret',
            content: 'hidden',
          },
        ],
        staticTools: [
          { serverId: 'docs', name: 'search_docs', description: 'Search docs' },
          { serverId: 'docs', name: 'delete_docs', description: 'Delete docs' },
        ],
      },
    ],
  },
}

describe('ConfiguredMcpRegistry', () => {
  it('returns only enabled allow-listed MCP inventory', async () => {
    const inventory = await new ConfiguredMcpRegistry().getInventory(settings)

    expect(inventory.servers).toEqual([expect.objectContaining({ id: 'docs', status: 'configured' })])
    expect(inventory.resources.map((resource) => resource.uri)).toEqual(['docs://intro'])
    expect(inventory.tools.map((tool) => tool.name)).toEqual(['search_docs'])
  })

  it('reads allow-listed static resources and denies blocked resources', async () => {
    const registry = new ConfiguredMcpRegistry()

    await expect(registry.readResource({ settings, serverId: 'docs', uri: 'docs://intro' })).resolves.toMatchObject({
      content: '# Intro',
      mimeType: 'text/markdown',
    })
    await expect(registry.readResource({ settings, serverId: 'docs', uri: 'docs://secret' })).rejects.toThrow('not allowed')
  })
})

describe('McpActionExecutor', () => {
  it('exposes list/read/invoke action definitions and executes resource reads', async () => {
    const executor = new McpActionExecutor(new ConfiguredMcpRegistry())

    expect((await executor.listDefinitions()).map((definition) => definition.id)).toEqual([
      'list_mcp_resources',
      'read_mcp_resource',
      'invoke_mcp_tool',
    ])

    const result = await executor.execute({
      run: { id: 'run-1', conversationId: 'conversation-1', status: 'started', role: 'build', createdAt: '2026-04-29T10:00:00.000Z' },
      action: (await executor.getDefinition('read_mcp_resource'))!,
      call: {
        id: 'call-1',
        runId: 'run-1',
        actionId: 'read_mcp_resource',
        input: { serverId: 'docs', uri: 'docs://intro' },
        requestedAt: '2026-04-29T10:00:00.000Z',
      },
      settings,
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({ status: 'completed', output: { content: '# Intro' } })
  })
})
