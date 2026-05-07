import { useQuery } from '@tanstack/react-query'

import { mcpInventoryQueryOptions } from '../../queries'
import { McpInspectorCard } from './McpInspectorCard'

export function McpSettingsTabContainer() {
  const mcpInventoryQuery = useQuery(mcpInventoryQueryOptions)

  return <McpInspectorCard inventory={mcpInventoryQuery.data ?? null} />
}
