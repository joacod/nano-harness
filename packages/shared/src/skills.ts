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
  validationWarnings: z.array(z.string().min(1)).default([]),
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

export const skillImprovementArtifactSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['create', 'update']),
  targetSkillId: z.string().min(1).optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  proposedFiles: z.array(z.object({
    relativePath: z.string().min(1),
    content: z.string().min(1),
  })).min(1),
  patchPreview: z.string().min(1),
  approvalRequiredForWrite: z.literal(true),
  createdAt: z.iso.datetime(),
})

export type SkillImprovementArtifact = z.infer<typeof skillImprovementArtifactSchema>

export const skillContextSchema = z.object({
  available: z.array(skillSummarySchema),
  selected: z.array(skillPackageSchema),
})

export type SkillContext = z.infer<typeof skillContextSchema>

export function createSkillDraftPrompt(task: string): string {
  return [
    'Create a project-local Agent Skill draft for this request.',
    'Use create_skill_improvement_artifact to produce a proposed .nano/skills/<skill-id>/SKILL.md file with required name and description frontmatter.',
    'Do not write skill files directly unless the user explicitly approves a separate write action.',
    'Include concrete triggers, relevant tools, safety notes, and concise reusable instructions.',
    task.trim(),
  ].join('\n\n')
}
