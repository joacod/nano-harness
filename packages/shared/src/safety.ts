import { z } from 'zod'

export const permissionEffectSchema = z.enum(['allow', 'deny', 'require_approval'])

export type PermissionEffect = z.infer<typeof permissionEffectSchema>

export const commandClassificationSchema = z.enum(['safe_inspection', 'validation', 'risky_mutation', 'denied'])

export type CommandClassification = z.infer<typeof commandClassificationSchema>

export const permissionPreviewSchema = z.object({
  summary: z.string().min(1),
  path: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  classification: commandClassificationSchema.optional(),
})

export type PermissionPreview = z.infer<typeof permissionPreviewSchema>

export const personalRulesSettingsSchema = z.object({
  neverWriteOutsideWorkspace: z.boolean().default(true),
  requireTestsAfterEdits: z.boolean().default(false),
  blockedActions: z.array(z.string().min(1)).default([]),
  deniedCommands: z.array(z.string().min(1)).default([]),
})

export type PersonalRulesSettings = z.infer<typeof personalRulesSettingsSchema>

export const hookSettingsSchema = z.object({
  enabled: z.boolean().default(true),
})

export type HookSettings = z.infer<typeof hookSettingsSchema>

export const safetySettingsSchema = z.object({
  personalRules: personalRulesSettingsSchema.default({
    neverWriteOutsideWorkspace: true,
    requireTestsAfterEdits: false,
    blockedActions: [],
    deniedCommands: [],
  }),
  hooks: hookSettingsSchema.default({
    enabled: true,
  }),
})

export type SafetySettings = z.infer<typeof safetySettingsSchema>

export const permissionDecisionSchema = z.object({
  effect: permissionEffectSchema,
  reason: z.string().min(1).optional(),
  matchedRule: z.string().min(1).optional(),
  preview: permissionPreviewSchema.optional(),
})

export type PermissionDecision = z.infer<typeof permissionDecisionSchema>

export const hookPhaseSchema = z.enum(['pre_tool_use', 'post_tool_use'])

export type HookPhase = z.infer<typeof hookPhaseSchema>

export const hookResultSchema = z.object({
  hookId: z.string().min(1),
  phase: hookPhaseSchema,
  status: z.enum(['completed', 'denied', 'failed']),
  message: z.string().min(1),
})

export type HookResult = z.infer<typeof hookResultSchema>

export function createDefaultSafetySettings(): SafetySettings {
  return safetySettingsSchema.parse({})
}
