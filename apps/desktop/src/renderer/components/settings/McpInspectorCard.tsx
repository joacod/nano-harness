import type { McpInventory } from '../../../../../../packages/shared/src'
import { FeedbackText, StatusBadge } from '../ui'

export function McpInspectorCard({ inventory }: { inventory: McpInventory | null }) {
  const servers = inventory?.servers ?? []
  const resources = inventory?.resources ?? []
  const tools = inventory?.tools ?? []

  return (
    <div className="settings-tab-stack">
      <p className="eyebrow">MCP</p>
      <h2>MCP inventory</h2>
      <FeedbackText>
        MCP servers are exposed only through filtered inventory, allow-listed resources, and approval-gated tool calls.
      </FeedbackText>
      {servers.length === 0 ? <FeedbackText>No MCP servers configured.</FeedbackText> : null}
      {servers.length > 0 ? (
        <ol className="settings-card-list" aria-label="Configured MCP servers">
          {servers.map((server) => (
            <li key={server.id} className="settings-card-item">
              <div className="timeline-card">
                <div className="timeline-header">
                  <strong>{server.label}</strong>
                  <StatusBadge status={server.enabled ? 'completed' : 'cancelled'}>{server.status}</StatusBadge>
                </div>
                <p className="timeline-type">{server.id} · {server.transport}</p>
                <small className="muted-copy">Allowed tools: {server.allowedTools.length ? server.allowedTools.join(', ') : 'none'}</small>
                <small className="muted-copy">Allowed resources: {server.allowedResources.length ? server.allowedResources.join(', ') : 'none'}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <FeedbackText>{resources.length} resources and {tools.length} tools are currently exposed to runs.</FeedbackText>
    </div>
  )
}
