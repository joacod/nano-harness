import { z } from 'zod'

export const mcpResourceSchema = z.object({
  serverId: z.string().min(1),
  uri: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
})

export type McpResource = z.infer<typeof mcpResourceSchema>

export const mcpToolSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
})

export type McpTool = z.infer<typeof mcpToolSchema>

export const mcpStaticResourceSchema = mcpResourceSchema.extend({
  content: z.string(),
})

export type McpStaticResource = z.infer<typeof mcpStaticResourceSchema>

const mcpServerSettingsBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(false),
  allowedTools: z.array(z.string().min(1)).default([]),
  allowedResources: z.array(z.string().min(1)).default([]),
  staticResources: z.array(mcpStaticResourceSchema).default([]),
  staticTools: z.array(mcpToolSchema).default([]),
})

export const mcpServerSettingsSchema = z.discriminatedUnion('transport', [
  mcpServerSettingsBaseSchema.extend({
    transport: z.literal('stdio'),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default([]),
    url: z.never().optional(),
  }),
  mcpServerSettingsBaseSchema.extend({
    transport: z.literal('http'),
    url: z.url().optional(),
    command: z.never().optional(),
    args: z.never().optional(),
  }),
])

export type McpServerSettings = z.infer<typeof mcpServerSettingsSchema>

export const mcpSettingsSchema = z.object({
  servers: z.array(mcpServerSettingsSchema).default([]),
})

export type McpSettings = z.infer<typeof mcpSettingsSchema>

export const mcpInventoryServerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'http']),
  status: z.enum(['disabled', 'configured', 'unconfigured']),
  allowedTools: z.array(z.string()),
  allowedResources: z.array(z.string()),
})

export const mcpInventorySchema = z.object({
  servers: z.array(mcpInventoryServerSchema),
  tools: z.array(mcpToolSchema),
  resources: z.array(mcpResourceSchema),
})

export type McpInventory = z.infer<typeof mcpInventorySchema>
