import { z } from 'zod'

import { jsonValueSchema } from './actions'

const reasoningDetailBaseSchema = z.object({
  id: z.string().nullable().optional(),
  format: z.string().optional(),
  index: z.number().optional(),
})

export const reasoningSummaryDetailSchema = reasoningDetailBaseSchema.extend({
  type: z.literal('reasoning.summary'),
  summary: z.string(),
})

export const reasoningTextDetailSchema = reasoningDetailBaseSchema.extend({
  type: z.literal('reasoning.text'),
  text: z.string(),
  signature: z.string().nullable().optional(),
})

export const reasoningEncryptedDetailSchema = reasoningDetailBaseSchema.extend({
  type: z.literal('reasoning.encrypted'),
  data: z.string(),
})

export const reasoningUnknownDetailSchema = reasoningDetailBaseSchema.extend({
  type: z.literal('reasoning.unknown'),
  data: jsonValueSchema,
})

export const reasoningDetailSchema = z.discriminatedUnion('type', [
  reasoningSummaryDetailSchema,
  reasoningTextDetailSchema,
  reasoningEncryptedDetailSchema,
  reasoningUnknownDetailSchema,
])

export type ReasoningDetail = z.infer<typeof reasoningDetailSchema>

export const providerReasoningDeltaSchema = z.object({
  text: z.string().optional(),
  details: z.array(reasoningDetailSchema).optional(),
})

export type ProviderReasoningDelta = z.infer<typeof providerReasoningDeltaSchema>
