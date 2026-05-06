import { z } from 'zod'

export const skillSourceSchema = z.enum(['bundled', 'user', 'project'])

export type SkillSource = z.infer<typeof skillSourceSchema>

export const skillMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  triggers: z.array(z.string().min(1)),
  tools: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string().min(1)),
})

export type SkillMetadata = z.infer<typeof skillMetadataSchema>

export const skillSummarySchema = skillMetadataSchema.extend({
  source: skillSourceSchema,
  path: z.string().min(1).optional(),
  enabled: z.boolean(),
})

export type SkillSummary = z.infer<typeof skillSummarySchema>

export const skillPackageSchema = skillSummarySchema.extend({
  content: z.string().min(1),
})

export type SkillPackage = z.infer<typeof skillPackageSchema>

export const skillSettingsSchema = z.object({
  disabledSkillIds: z.array(z.string().min(1)).default([]),
})

export type SkillSettings = z.infer<typeof skillSettingsSchema>

export const skillInventorySchema = z.object({
  skills: z.array(skillSummarySchema),
})

export type SkillInventory = z.infer<typeof skillInventorySchema>

export const skillContextSchema = z.object({
  available: z.array(skillSummarySchema),
  selected: z.array(skillPackageSchema),
})

export type SkillContext = z.infer<typeof skillContextSchema>
