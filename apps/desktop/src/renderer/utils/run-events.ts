import type { AppSettings, ApprovalRequest, ConversationSnapshot, RunEvent } from '../../../../../packages/shared/src'
import { getProviderDefinition } from '../../../../../packages/shared/src'
import { formatTimestamp, previewText } from './formatting'

export type StreamingRunState = {
  conversationId: string
  content: string
  isStreaming: boolean
  errorMessage?: string
}

export function updateStreamingState(current: Record<string, StreamingRunState>, event: RunEvent) {
  if (event.type === 'run.created') {
    return {
      ...current,
      [event.runId]: {
        conversationId: event.payload.run.conversationId,
        content: '',
        isStreaming: false,
      },
    }
  }

  if (event.type === 'provider.delta') {
    const existing = current[event.runId]

    if (!existing) {
      return current
    }

    return {
      ...current,
      [event.runId]: {
        ...existing,
        content: `${existing.content}${event.payload.delta}`,
        isStreaming: true,
      },
    }
  }

  if (event.type === 'provider.error') {
    const existing = current[event.runId]

    if (!existing) {
      return current
    }

    return {
      ...current,
      [event.runId]: {
        ...existing,
        isStreaming: false,
        errorMessage: event.payload.message,
      },
    }
  }

  if (event.type === 'run.completed' || event.type === 'run.cancelled' || event.type === 'run.failed') {
    const nextState = { ...current }
    delete nextState[event.runId]
    return nextState
  }

  return current
}

export function updateLiveRunEvents(current: Record<string, RunEvent[]>, event: RunEvent): Record<string, RunEvent[]> {
  const nextEvents = [...(current[event.runId] ?? []), event].slice(-200)

  return {
    ...current,
    [event.runId]: nextEvents,
  }
}

export function mergeRunEvents(persistedEvents: RunEvent[], liveEvents: RunEvent[]): RunEvent[] {
  const mergedEvents = new Map<string, RunEvent>()

  for (const event of persistedEvents) {
    mergedEvents.set(event.id, event)
  }

  for (const event of liveEvents) {
    mergedEvents.set(event.id, event)
  }

  return [...mergedEvents.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}

export function describeRunEvent(event: RunEvent) {
  switch (event.type) {
    case 'run.created':
      return { title: 'Run created', detail: `Conversation ${event.payload.run.conversationId}` }
    case 'run.started':
      return { title: 'Run started', detail: `Execution began at ${formatTimestamp(event.payload.startedAt)}` }
    case 'run.waiting_approval':
      return { title: 'Waiting for approval', detail: `Approval request ${event.payload.approvalRequestId}` }
    case 'run.completed':
      return { title: 'Run completed', detail: `Finished at ${formatTimestamp(event.payload.finishedAt)}` }
    case 'run.failed':
      return { title: 'Run failed', detail: event.payload.message }
    case 'run.cancelled':
      return { title: 'Run cancelled', detail: event.payload.reason ?? 'Cancelled without a recorded reason.' }
    case 'provider.requested':
      return { title: 'Provider request sent', detail: `${event.payload.provider} · ${event.payload.model}` }
    case 'provider.delta':
      return { title: 'Provider streamed delta', detail: previewText(event.payload.delta, 160) }
    case 'provider.completed':
      return { title: 'Provider stream completed', detail: `Assistant message ${event.payload.messageId}` }
    case 'provider.error':
      return { title: 'Provider error surfaced', detail: event.payload.message }
    case 'action.requested':
      return { title: `Action requested: ${event.payload.actionCall.actionId}`, detail: previewText(JSON.stringify(event.payload.actionCall.input)) }
    case 'action.started':
      return { title: 'Action started', detail: `Call ${event.payload.actionCallId}` }
    case 'action.completed':
      return { title: 'Action completed', detail: previewText(JSON.stringify(event.payload.result.output)) }
    case 'action.failed':
      return { title: 'Action failed', detail: event.payload.result.errorMessage ?? 'Action returned a failed result.' }
    case 'approval.required':
      return { title: 'Approval required', detail: event.payload.approvalRequest.reason }
    case 'approval.granted':
      return { title: 'Approval granted', detail: `Resolved at ${formatTimestamp(event.payload.resolution.decidedAt)}` }
    case 'approval.rejected':
      return { title: 'Approval rejected', detail: `Resolved at ${formatTimestamp(event.payload.resolution.decidedAt)}` }
    case 'message.created':
      return { title: `${event.payload.message.role} message persisted`, detail: previewText(event.payload.message.content, 160) }
  }
}

export function getEventFamily(eventType: RunEvent['type']) {
  return eventType.split('.')[0]
}

export function getRecoverableRunAction(run: ConversationSnapshot['runs'][number], pendingApproval: ApprovalRequest | null) {
  if (run.status === 'created' || run.status === 'started') {
    return 'resume'
  }

  if (run.status === 'waiting_approval' && !pendingApproval) {
    return 'resume'
  }

  return null
}

export function getPendingApproval(snapshot: ConversationSnapshot | undefined, runId: string | null): ApprovalRequest | null {
  if (!snapshot || !runId) {
    return null
  }

  const resolvedRequestIds = new Set(snapshot.approvalResolutions.map((resolution) => resolution.approvalRequestId))

  return (
    [...snapshot.approvalRequests]
      .reverse()
      .find((request) => request.runId === runId && !resolvedRequestIds.has(request.id)) ?? null
  )
}

export function getProviderRequestForRun(events: RunEvent[], runId: string) {
  const providerRequestedEvent = events.find((event) => event.runId === runId && event.type === 'provider.requested')

  return providerRequestedEvent?.type === 'provider.requested' ? providerRequestedEvent : null
}

export function applyProviderDefaults(settings: AppSettings, providerKey: AppSettings['provider']['provider']): AppSettings {
  const provider = getProviderDefinition(providerKey)

  return {
    ...settings,
    provider: {
      ...settings.provider,
      provider: provider.key,
      model: provider.defaultModel,
    },
  }
}
