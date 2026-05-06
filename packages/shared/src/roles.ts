import { z } from 'zod'

export const agentRoleSchema = z.enum(['plan', 'build', 'review'])

export type AgentRole = z.infer<typeof agentRoleSchema>

export const defaultAgentRole: AgentRole = 'build'
