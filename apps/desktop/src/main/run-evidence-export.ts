import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ActionCall, ActionResult } from '../../../../packages/shared/src'
import { exportRunEvidenceResultSchema } from '../../../../packages/shared/src'
import type { DesktopRuntime } from './runtime'

type RunEvidenceRuntime = {
  store: Pick<DesktopRuntime['store'], 'getRun' | 'getConversation'> & {
    paths: {
      dataDir: string
    }
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getOutputPath(result: ActionResult): string | null {
  if (!isObject(result.output) || typeof result.output.path !== 'string') {
    return null
  }

  return result.output.path
}

export async function exportRunEvidence(runtime: RunEvidenceRuntime, runId: string) {
  const run = await runtime.store.getRun(runId)

  if (!run) {
    throw new Error(`Run ${runId} not found`)
  }

  const snapshot = await runtime.store.getConversation(run.conversationId)
  const runMessages = snapshot.messages.filter((message) => message.runId === runId)
  const runEvents = snapshot.events.filter((event) => event.runId === runId)
  const actionCalls = runEvents.flatMap((event): ActionCall[] => event.type === 'action.requested' ? [event.payload.actionCall] : [])
  const actionResults = runEvents.flatMap((event): ActionResult[] =>
    event.type === 'action.completed' || event.type === 'action.failed' ? [event.payload.result] : [],
  )
  const actionByCallId = new Map(actionCalls.map((actionCall) => [actionCall.id, actionCall]))
  const changedFiles = [...new Set(actionResults.flatMap((result) => {
    const actionCall = actionByCallId.get(result.actionCallId)
    const outputPath = getOutputPath(result)

    return outputPath && (actionCall?.actionId === 'write_file' || actionCall?.actionId === 'apply_patch') ? [outputPath] : []
  }))].sort((left, right) => left.localeCompare(right))
  const validationOutputs = actionResults.filter((result) => actionByCallId.get(result.actionCallId)?.actionId === 'run_command')
  const approvals = {
    requests: snapshot.approvalRequests.filter((request) => request.runId === runId),
    resolutions: snapshot.approvalResolutions.filter((resolution) =>
      snapshot.approvalRequests.some((request) => request.runId === runId && request.id === resolution.approvalRequestId),
    ),
  }
  const artifact = {
    exportedAt: new Date().toISOString(),
    run,
    transcript: runMessages,
    events: runEvents,
    approvals,
    toolCalls: actionCalls,
    toolResults: actionResults,
    changedFiles,
    validationOutput: validationOutputs,
  } satisfies Record<string, unknown>
  const exportDir = path.join(runtime.store.paths.dataDir, 'run-exports')
  const exportedFilePath = path.join(exportDir, `${sanitizeFileName(runId)}-evidence.json`)

  await mkdir(exportDir, { recursive: true })
  await writeFile(exportedFilePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

  return exportRunEvidenceResultSchema.parse({
    exportedFilePath,
    changedFiles,
    validationOutputs: validationOutputs.length,
  })
}
