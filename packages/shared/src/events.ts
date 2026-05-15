import { z } from 'zod'

import { actionCallSchema, actionDefinitionSchema, actionResultSchema } from './actions'
import { approvalRequestSchema, approvalResolutionSchema } from './approvals'
import { messageSchema } from './messages'
import { memoryProposalSchema, memoryRecallSchema } from './memory'
import { mcpInventorySchema } from './mcp'
import { providerReasoningDeltaSchema } from './reasoning'
import { runSchema } from './runs'
import { hookPhaseSchema, hookResultSchema, permissionDecisionSchema } from './safety'
import { skillSummarySchema } from './skills'
import { specArtifactKindSchema, specChangeSummarySchema, specEvidenceLinkSchema, specTaskSchema } from './spec'

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
    permissions: z.object({
      denied: z.array(permissionDecisionSchema),
      risky: z.array(permissionDecisionSchema),
      activeRules: z.array(z.string().min(1)),
      activeHooks: z.array(z.string().min(1)),
    }),
    skills: z.object({
      available: z.array(skillSummarySchema),
      selected: z.array(skillSummarySchema),
    }),
    mcp: mcpInventorySchema,
    memory: memoryRecallSchema,
  }),
})

export const memoryProposalCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal('memory.proposal_created'),
  payload: z.object({
    proposal: memoryProposalSchema,
  }),
})

export const specChangeCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal('spec.change_created'),
  payload: z.object({
    change: specChangeSummarySchema,
  }),
})

export const specArtifactWrittenEventSchema = eventBaseSchema.extend({
  type: z.literal('spec.artifact_written'),
  payload: z.object({
    changeId: z.string().min(1),
    artifactKind: specArtifactKindSchema,
    path: z.string().min(1),
  }),
})

export const specTaskUpdatedEventSchema = eventBaseSchema.extend({
  type: z.literal('spec.task_updated'),
  payload: z.object({
    changeId: z.string().min(1),
    task: specTaskSchema,
  }),
})

export const specEvidenceAppendedEventSchema = eventBaseSchema.extend({
  type: z.literal('spec.evidence_appended'),
  payload: z.object({
    changeId: z.string().min(1),
    evidence: specEvidenceLinkSchema,
  }),
})

export const specChangeArchivedEventSchema = eventBaseSchema.extend({
  type: z.literal('spec.change_archived'),
  payload: z.object({
    changeId: z.string().min(1),
    archivedPath: z.string().min(1),
  }),
})

export const validationObligationSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
  sourceActionCallIds: z.array(z.string().min(1)).default([]),
  changedFiles: z.array(z.string().min(1)).default([]),
  validationCommands: z.array(z.string().min(1)).default([]),
  createdAt: z.iso.datetime(),
})

export type ValidationObligation = z.infer<typeof validationObligationSchema>

export const obligationCreatedEventSchema = eventBaseSchema.extend({
  type: z.literal('obligation.created'),
  payload: z.object({
    obligation: validationObligationSchema,
  }),
})

export const obligationSatisfiedEventSchema = eventBaseSchema.extend({
  type: z.literal('obligation.satisfied'),
  payload: z.object({
    obligationId: z.string().min(1),
    evidence: z.array(z.string().min(1)).default([]),
    satisfiedAt: z.iso.datetime(),
  }),
})

export const obligationUnmetEventSchema = eventBaseSchema.extend({
  type: z.literal('obligation.unmet'),
  payload: z.object({
    obligationId: z.string().min(1),
    reason: z.string().min(1),
    checkedAt: z.iso.datetime(),
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

export const hookStartedEventSchema = eventBaseSchema.extend({
  type: z.literal('hook.started'),
  payload: z.object({
    hookId: z.string().min(1),
    phase: hookPhaseSchema,
    actionCallId: z.string().min(1),
  }),
})

export const hookCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal('hook.completed'),
  payload: z.object({
    result: hookResultSchema.refine((value) => value.status === 'completed', 'hook.completed must carry a completed hook result'),
  }),
})

export const hookDeniedEventSchema = eventBaseSchema.extend({
  type: z.literal('hook.denied'),
  payload: z.object({
    result: hookResultSchema.refine((value) => value.status === 'denied', 'hook.denied must carry a denied hook result'),
  }),
})

export const hookErrorEventSchema = eventBaseSchema.extend({
  type: z.literal('hook.error'),
  payload: z.object({
    result: hookResultSchema.refine((value) => value.status === 'failed', 'hook.error must carry a failed hook result'),
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
  memoryProposalCreatedEventSchema,
  specChangeCreatedEventSchema,
  specArtifactWrittenEventSchema,
  specTaskUpdatedEventSchema,
  specEvidenceAppendedEventSchema,
  specChangeArchivedEventSchema,
  obligationCreatedEventSchema,
  obligationSatisfiedEventSchema,
  obligationUnmetEventSchema,
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
  hookStartedEventSchema,
  hookCompletedEventSchema,
  hookDeniedEventSchema,
  hookErrorEventSchema,
  approvalRequiredEventSchema,
  approvalGrantedEventSchema,
  approvalRejectedEventSchema,
  messageCreatedEventSchema,
])

export type RunEvent = z.infer<typeof runEventSchema>

export type RunEventType = RunEvent['type']
