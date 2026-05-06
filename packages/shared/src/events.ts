import { z } from 'zod'

import { actionCallSchema, actionDefinitionSchema, actionResultSchema } from './actions'
import { approvalRequestSchema, approvalResolutionSchema } from './approvals'
import { messageSchema } from './messages'
import { mcpInventorySchema } from './mcp'
import { providerReasoningDeltaSchema } from './reasoning'
import { runSchema } from './runs'
import { skillSummarySchema } from './skills'

const eventBaseSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.iso.datetime(),
})

export const runCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal('run.created'),
  payload: z.object({
    run: runSchema,
  }),
})

export const runStartedEventSchema = eventBaseSchema.extend({
  type: z.literal('run.started'),
  payload: z.object({
    startedAt: z.iso.datetime(),
  }),
})

export const runDryRunPreviewEventSchema = eventBaseSchema.extend({
  type: z.literal('run.dry_run_preview'),
  payload: z.object({
    provider: z.object({
      provider: z.string().min(1),
      model: z.string().min(1),
      baseUrl: z.string().min(1).optional(),
    }),
    workspace: z.object({
      rootPath: z.string().min(1),
      approvalPolicy: z.string().min(1),
    }),
    actions: z.array(actionDefinitionSchema.pick({ id: true, title: true, requiresApproval: true })),
    skills: z.object({
      available: z.array(skillSummarySchema),
      selected: z.array(skillSummarySchema),
    }),
    mcp: mcpInventorySchema,
  }),
})

export const runWaitingApprovalEventSchema = eventBaseSchema.extend({
  type: z.literal('run.waiting_approval'),
  payload: z.object({
    approvalRequestId: z.string().min(1),
  }),
})

export const runCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal('run.completed'),
  payload: z.object({
    finishedAt: z.iso.datetime(),
  }),
})

export const runFailedEventSchema = eventBaseSchema.extend({
  type: z.literal('run.failed'),
  payload: z.object({
    message: z.string().min(1),
  }),
})

export const runCancelledEventSchema = eventBaseSchema.extend({
  type: z.literal('run.cancelled'),
  payload: z.object({
    reason: z.string().min(1).optional(),
  }),
})

export const providerRequestedEventSchema = eventBaseSchema.extend({
  type: z.literal('provider.requested'),
  payload: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
  }),
})

export const providerDeltaEventSchema = eventBaseSchema.extend({
  type: z.literal('provider.delta'),
  payload: z.object({
    delta: z.string(),
  }),
})

export const providerReasoningDeltaEventSchema = eventBaseSchema.extend({
  type: z.literal('provider.reasoning_delta'),
  payload: providerReasoningDeltaSchema,
})

export const providerCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal('provider.completed'),
  payload: z.object({
    messageId: z.string().min(1),
  }),
})

export const providerErrorEventSchema = eventBaseSchema.extend({
  type: z.literal('provider.error'),
  payload: z.object({
    message: z.string().min(1),
  }),
})

export const actionRequestedEventSchema = eventBaseSchema.extend({
  type: z.literal('action.requested'),
  payload: z.object({
    actionCall: actionCallSchema,
  }),
})

export const actionStartedEventSchema = eventBaseSchema.extend({
  type: z.literal('action.started'),
  payload: z.object({
    actionCallId: z.string().min(1),
  }),
})

export const actionCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal('action.completed'),
  payload: z.object({
    result: actionResultSchema,
  }),
})

export const actionFailedEventSchema = eventBaseSchema.extend({
  type: z.literal('action.failed'),
  payload: z.object({
    result: actionResultSchema,
  }),
})

export const approvalRequiredEventSchema = eventBaseSchema.extend({
  type: z.literal('approval.required'),
  payload: z.object({
    approvalRequest: approvalRequestSchema,
  }),
})

export const approvalGrantedEventSchema = eventBaseSchema.extend({
  type: z.literal('approval.granted'),
  payload: z.object({
    resolution: approvalResolutionSchema.refine(
      (value) => value.decision === 'granted',
      'approval.granted must carry a granted resolution',
    ),
  }),
})

export const approvalRejectedEventSchema = eventBaseSchema.extend({
  type: z.literal('approval.rejected'),
  payload: z.object({
    resolution: approvalResolutionSchema.refine(
      (value) => value.decision === 'rejected',
      'approval.rejected must carry a rejected resolution',
    ),
  }),
})

export const messageCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal('message.created'),
  payload: z.object({
    message: messageSchema,
  }),
})

export const runEventSchema = z.discriminatedUnion('type', [
  runCreatedEventSchema,
  runStartedEventSchema,
  runDryRunPreviewEventSchema,
  runWaitingApprovalEventSchema,
  runCompletedEventSchema,
  runFailedEventSchema,
  runCancelledEventSchema,
  providerRequestedEventSchema,
  providerDeltaEventSchema,
  providerReasoningDeltaEventSchema,
  providerCompletedEventSchema,
  providerErrorEventSchema,
  actionRequestedEventSchema,
  actionStartedEventSchema,
  actionCompletedEventSchema,
  actionFailedEventSchema,
  approvalRequiredEventSchema,
  approvalGrantedEventSchema,
  approvalRejectedEventSchema,
  messageCreatedEventSchema,
])

export type RunEvent = z.infer<typeof runEventSchema>

export type RunEventType = RunEvent['type']
