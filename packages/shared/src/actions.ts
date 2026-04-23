import { z } from 'zod'

const jsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonLiteralSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
)

export const actionDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  requiresApproval: z.boolean(),
})

export type ActionDefinition = z.infer<typeof actionDefinitionSchema>

export const actionCallSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  actionId: z.string().min(1),
  input: z.record(z.string(), jsonValueSchema),
  requestedAt: z.string().datetime(),
})

export type ActionCall = z.infer<typeof actionCallSchema>

export const actionResultStatusSchema = z.enum(['completed', 'failed'])

export type ActionResultStatus = z.infer<typeof actionResultStatusSchema>

export const actionResultSchema = z.object({
  id: z.string().min(1),
  actionCallId: z.string().min(1),
  status: actionResultStatusSchema,
  output: jsonValueSchema.optional(),
  errorMessage: z.string().min(1).optional(),
  completedAt: z.string().datetime(),
})

export type ActionResult = z.infer<typeof actionResultSchema>
