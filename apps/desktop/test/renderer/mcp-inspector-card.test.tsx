// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { McpInventory } from '@nano-harness/shared'

import { McpInspectorCard } from '../../src/renderer/components/settings/McpInspectorCard'

describe('McpInspectorCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('surfaces unavailable MCP server status messages', () => {
    render(<McpInspectorCard inventory={createInventory()} />)

    expect(screen.getByText('Broken Docs Server')).toBeTruthy()
    expect(screen.getByText('unavailable')).toBeTruthy()
    expect(screen.getByText('MCP request tools/list timed out')).toBeTruthy()
    expect(screen.getByText('1 resources and 1 tools are currently exposed to runs.')).toBeTruthy()
  })
})

function createInventory(): McpInventory {
  return {
    servers: [{
      id: 'broken-docs',
      label: 'Broken Docs Server',
      enabled: true,
      transport: 'stdio',
      status: 'unavailable',
      statusMessage: 'MCP request tools/list timed out',
      allowedTools: ['search_docs'],
      allowedResources: ['docs://intro'],
    }],
    resources: [{ serverId: 'broken-docs', uri: 'docs://intro', name: 'Intro' }],
    tools: [{ serverId: 'broken-docs', name: 'search_docs' }],
  }
}
