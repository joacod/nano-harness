import { readFile } from 'node:fs/promises'

import { app, ipcMain, shell } from 'electron'

import {
  appSettingsSchema,
  benchmarkCaseRegistry,
  benchmarkSuiteRunResultSchema,
  desktopBridgeChannels,
  desktopContextSchema,
  exportRunEvidenceInputSchema,
  readSpecArtifactInputSchema,
  sessionInputSchema,
  getConversationInputSchema,
  getProviderDefinition,
  openExternalUrlInputSchema,
  providerCredentialInputSchema,
  resolveApprovalInputSchema,
  resolveMemoryProposalInputSchema,
  runCreateInputSchema,
  runIdInputSchema,
  saveProviderAuthInputSchema,
  showItemInFolderInputSchema,
  clearProviderAuthInputSchema,
  specArtifactKindSchema,
  specArtifactReadResultSchema,
  specChangeDetailResultSchema,
  specChangeInputSchema,
  specChangeListSchema,
  startBenchmarkSuiteInputSchema,
  startSpecRunInputSchema,
  startProviderOauthInputSchema,
  startProviderOauthResultSchema,
  startRunResultSchema,
  type AgentRole,
  type AppSettings,
  type BenchmarkCase,
  type SpecArtifactKind,
  type SpecChangeDetail,
  type ProviderAuthMethod,
} from '../../../../packages/shared/src'
import { SpecWorkspaceService } from '../../../../packages/infra/src'
import { resolveWorkspacePath } from '../../../../packages/infra/src/actions/workspace'
import { exportData, importData } from './data-transfer'
import { startOpenAIChatGptOAuth } from './openai-chatgpt-auth'
import type { DesktopRuntime } from './runtime'
import { buildProviderStatus } from './runtime'
import { exportRunEvidence } from './run-evidence-export'
import { exportSession } from './session-export'
import { encryptCredentialPayload } from './secure-credentials'

type IpcRuntime = {
  store: {
    paths: {
      dataDir: string
      databaseFilePath: string
    }
    listConversations: DesktopRuntime['store']['listConversations']
    listSessions: DesktopRuntime['store']['listSessions']
    listRuns: DesktopRuntime['store']['listRuns']
    listMemoryRecords: DesktopRuntime['store']['listMemoryRecords']
    listMemoryProposals: DesktopRuntime['store']['listMemoryProposals']
    resolveMemoryProposal: DesktopRuntime['store']['resolveMemoryProposal']
    getProviderCredentialStatus: DesktopRuntime['store']['getProviderCredentialStatus']
    getEncryptedProviderCredentialPayload: DesktopRuntime['store']['getEncryptedProviderCredentialPayload']
    saveProviderCredentialPayload: DesktopRuntime['store']['saveProviderCredentialPayload']
    clearProviderCredential: DesktopRuntime['store']['clearProviderCredential']
    getSettings: DesktopRuntime['store']['getSettings']
    saveSettings: DesktopRuntime['store']['saveSettings']
    getConversation: DesktopRuntime['store']['getConversation']
    getRun: DesktopRuntime['store']['getRun']
    forkSession: DesktopRuntime['store']['forkSession']
    cloneSession: DesktopRuntime['store']['cloneSession']
    listSessionCompactions: DesktopRuntime['store']['listSessionCompactions']
    createSessionCompaction: DesktopRuntime['store']['createSessionCompaction']
    exportSession: DesktopRuntime['store']['exportSession']
    backupToFile: DesktopRuntime['store']['backupToFile']
    sanitizeDatabaseFile: DesktopRuntime['store']['sanitizeDatabaseFile']
    validateDatabaseFile: DesktopRuntime['store']['validateDatabaseFile']
    createStagedImportCopy: DesktopRuntime['store']['createStagedImportCopy']
    close: DesktopRuntime['store']['close']
  }
  skillResolver: {
    listSkills: DesktopRuntime['skillResolver']['listSkills']
  }
  mcpRegistry: {
    getInventory: DesktopRuntime['mcpRegistry']['getInventory']
  }
  runEngine: {
    startRun: DesktopRuntime['runEngine']['startRun']
    resumeRun: DesktopRuntime['runEngine']['resumeRun']
    cancelRun: DesktopRuntime['runEngine']['cancelRun']
    resolveApproval: DesktopRuntime['runEngine']['resolveApproval']
  }
}

const specWorkspaceService = new SpecWorkspaceService()

function parseExternalUrl(payload: unknown): string {
  const { url } = openExternalUrlInputSchema.parse(payload)
  const parsedUrl = new URL(url)

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http and https links can be opened externally.')
  }

  return parsedUrl.toString()
}

export function setupIpcHandlers(runtime: IpcRuntime): void {
  ipcMain.handle(desktopBridgeChannels.getContext, async () => {
    return desktopContextSchema.parse({
      platform: process.platform,
      version: app.getVersion(),
      dataPath: runtime.store.paths.databaseFilePath,
    })
  })

  ipcMain.handle(desktopBridgeChannels.listConversations, async () => {
    return await runtime.store.listConversations()
  })

  ipcMain.handle(desktopBridgeChannels.listSessions, async () => {
    return await runtime.store.listSessions()
  })

  ipcMain.handle(desktopBridgeChannels.getProviderStatus, async () => {
    return await buildProviderStatus(runtime, await runtime.store.getSettings())
  })

  ipcMain.handle(desktopBridgeChannels.listSkills, async () => {
    const settings = await runtime.store.getSettings()

    if (!settings) {
      return { skills: [] }
    }

    const skills = await runtime.skillResolver.listSkills(settings)
    return { skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers,
      tools: skill.tools,
      safetyNotes: skill.safetyNotes,
      source: skill.source,
      path: skill.path,
      enabled: skill.enabled,
      validationWarnings: skill.validationWarnings,
    })) }
  })

  ipcMain.handle(desktopBridgeChannels.listMcpInventory, async () => {
    const settings = await runtime.store.getSettings()

    if (!settings) {
      return { servers: [], tools: [], resources: [] }
    }

    return await runtime.mcpRegistry.getInventory(settings)
  })

  ipcMain.handle(desktopBridgeChannels.listMemoryRecords, async () => {
    return { records: await runtime.store.listMemoryRecords() }
  })

  ipcMain.handle(desktopBridgeChannels.listMemoryProposals, async () => {
    return { proposals: await runtime.store.listMemoryProposals() }
  })

  ipcMain.handle(desktopBridgeChannels.resolveMemoryProposal, async (_event, payload) => {
    const input = resolveMemoryProposalInputSchema.parse(payload)
    await runtime.store.resolveMemoryProposal(input)
  })

  ipcMain.handle(desktopBridgeChannels.listSpecChanges, async () => {
    const settings = await runtime.store.getSettings()

    if (!settings) {
      return specChangeListSchema.parse({ changes: [] })
    }

    return specChangeListSchema.parse({ changes: await specWorkspaceService.listChanges(settings.workspace.rootPath, { includeArchived: true }) })
  })

  ipcMain.handle(desktopBridgeChannels.getSpecChange, async (_event, payload) => {
    const input = specChangeInputSchema.parse(payload)
    const settings = await requireSettings(runtime)

    return specChangeDetailResultSchema.parse({
      change: await specWorkspaceService.getChange(settings.workspace.rootPath, input.changeId),
    })
  })

  ipcMain.handle(desktopBridgeChannels.readSpecArtifact, async (_event, payload) => {
    const input = readSpecArtifactInputSchema.parse(payload)
    const settings = await requireSettings(runtime)

    return specArtifactReadResultSchema.parse(await specWorkspaceService.readArtifact(settings.workspace.rootPath, {
      changeId: input.changeId,
      kind: input.artifactKind,
      relativePath: input.relativePath,
    }))
  })

  ipcMain.handle(desktopBridgeChannels.startSpecRun, async (_event, payload) => {
    const input = startSpecRunInputSchema.parse(payload)
    const settings = await requireSettings(runtime)
    const change = await specWorkspaceService.getChange(settings.workspace.rootPath, input.changeId)

    if (!change) {
      throw new Error(`Spec change ${input.changeId} not found`)
    }

    const handle = await runtime.runEngine.startRun({
      conversationId: input.conversationId,
      role: input.role,
      prompt: await buildSpecRunPrompt(settings, change, input.role, input.taskIds ?? [], input.workflowIntent ?? getDefaultSpecWorkflowIntent(input.role)),
    })

    return startRunResultSchema.parse({ runId: handle.runId })
  })

  ipcMain.handle(desktopBridgeChannels.startBenchmarkSuite, async (_event, payload) => {
    const input = startBenchmarkSuiteInputSchema.parse(payload)
    const settings = await requireSettings(runtime)
    const knownCases = new Map(benchmarkCaseRegistry.cases.map((benchmarkCase) => [benchmarkCase.id, benchmarkCase]))
    const requestedCaseIds = input.caseIds ?? benchmarkCaseRegistry.cases.map((benchmarkCase) => benchmarkCase.id)
    const unknownCaseIds = requestedCaseIds.filter((caseId) => !knownCases.has(caseId))
    const selectedCases = requestedCaseIds.flatMap((caseId) => {
      const benchmarkCase = knownCases.get(caseId)
      return benchmarkCase ? [benchmarkCase] : []
    })
    const runs = []

    for (const benchmarkCase of selectedCases) {
      const conversationId = `benchmark-${sanitizeId(input.suite)}-${sanitizeId(benchmarkCase.id)}-${Date.now().toString(36)}`
      const handle = await runtime.runEngine.startRun({
        conversationId,
        role: 'build',
        prompt: await buildBenchmarkRunPrompt(settings, input.suite, benchmarkCase),
      })

      runs.push({
        caseId: benchmarkCase.id,
        conversationId,
        runId: handle.runId,
      })
    }

    return benchmarkSuiteRunResultSchema.parse({ suite: input.suite, runs, unknownCaseIds })
  })

  ipcMain.handle(desktopBridgeChannels.getProviderCredentialStatus, async (_event, payload) => {
    const input = providerCredentialInputSchema.parse(payload)
    return await runtime.store.getProviderCredentialStatus(input.provider)
  })

  ipcMain.handle(desktopBridgeChannels.saveProviderAuth, async (_event, payload) => {
    const input = saveProviderAuthInputSchema.parse(payload)
    await runtime.store.saveProviderCredentialPayload(
      input.provider,
      input.authMethod,
      encryptCredentialPayload({ authMethod: 'api-key', apiKey: input.apiKey.trim() }),
    )
  })

  ipcMain.handle(desktopBridgeChannels.startProviderOauth, async (_event, payload) => {
    const input = startProviderOauthInputSchema.parse(payload)
    const provider = getProviderDefinition(input.provider)

    if (!(provider.authMethods as readonly ProviderAuthMethod[]).includes('oauth')) {
      throw new Error(`${provider.label} does not support OAuth sign-in.`)
    }

    const credential = await startOpenAIChatGptOAuth({ openExternal: (url) => shell.openExternal(url) })

    await runtime.store.saveProviderCredentialPayload(
      input.provider,
      'oauth',
      encryptCredentialPayload(credential),
    )

    return startProviderOauthResultSchema.parse({
      provider: input.provider,
      accountId: credential.accountId,
    })
  })

  ipcMain.handle(desktopBridgeChannels.clearProviderAuth, async (_event, payload) => {
    const input = clearProviderAuthInputSchema.parse(payload)
    const provider = getProviderDefinition(input.provider)
    const authMethod = input.authMethod ?? provider.defaultAuthMethod

    if (!(provider.authMethods as readonly ProviderAuthMethod[]).includes(authMethod)) {
      throw new Error(`${provider.label} does not support ${authMethod} auth.`)
    }

    if (authMethod !== 'none') {
      await runtime.store.clearProviderCredential(input.provider, authMethod)
    }
  })

  ipcMain.handle(desktopBridgeChannels.exportData, async () => {
    return await exportData(runtime)
  })

  ipcMain.handle(desktopBridgeChannels.importData, async () => {
    return await importData(runtime)
  })

  ipcMain.handle(desktopBridgeChannels.exportRunEvidence, async (_event, payload) => {
    const input = exportRunEvidenceInputSchema.parse(payload)
    return await exportRunEvidence(runtime, input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.getSettings, async () => {
    return await runtime.store.getSettings()
  })

  ipcMain.handle(desktopBridgeChannels.saveSettings, async (_event, payload) => {
    const settings = appSettingsSchema.parse(payload)
    await runtime.store.saveSettings(settings)
    return settings
  })

  ipcMain.handle(desktopBridgeChannels.getConversation, async (_event, payload) => {
    const input = getConversationInputSchema.parse(payload)
    return await runtime.store.getConversation(input.conversationId)
  })

  ipcMain.handle(desktopBridgeChannels.forkSession, async (_event, payload) => {
    const input = sessionInputSchema.parse(payload)
    const session = await runtime.store.forkSession(input.sessionId)
    return { sessionId: session.id, conversationId: session.conversationId }
  })

  ipcMain.handle(desktopBridgeChannels.cloneSession, async (_event, payload) => {
    const input = sessionInputSchema.parse(payload)
    const session = await runtime.store.cloneSession(input.sessionId)
    return { sessionId: session.id, conversationId: session.conversationId }
  })

  ipcMain.handle(desktopBridgeChannels.listSessionCompactions, async (_event, payload) => {
    const input = sessionInputSchema.parse(payload)
    return { compactions: await runtime.store.listSessionCompactions(input.sessionId) }
  })

  ipcMain.handle(desktopBridgeChannels.compactSession, async (_event, payload) => {
    const input = sessionInputSchema.parse(payload)
    return { compaction: await runtime.store.createSessionCompaction(input.sessionId) }
  })

  ipcMain.handle(desktopBridgeChannels.exportSession, async (_event, payload) => {
    const input = sessionInputSchema.parse(payload)
    return await exportSession(runtime, input.sessionId)
  })

  ipcMain.handle(desktopBridgeChannels.startRun, async (_event, payload) => {
    const input = runCreateInputSchema.parse(payload)
    const handle = await runtime.runEngine.startRun(input)
    return startRunResultSchema.parse({
      runId: handle.runId,
    })
  })

  ipcMain.handle(desktopBridgeChannels.resumeRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.resumeRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.cancelRun, async (_event, payload) => {
    const input = runIdInputSchema.parse(payload)
    await runtime.runEngine.cancelRun(input.runId)
  })

  ipcMain.handle(desktopBridgeChannels.resolveApproval, async (_event, payload) => {
    const input = resolveApprovalInputSchema.parse(payload)
    await runtime.runEngine.resolveApproval(input)
  })

  ipcMain.handle(desktopBridgeChannels.openExternalUrl, async (_event, payload) => {
    await shell.openExternal(parseExternalUrl(payload))
  })

  ipcMain.handle(desktopBridgeChannels.showItemInFolder, async (_event, payload) => {
    const input = showItemInFolderInputSchema.parse(payload)
    shell.showItemInFolder(input.filePath)
  })
}

async function requireSettings(runtime: IpcRuntime): Promise<AppSettings> {
  const settings = await runtime.store.getSettings()

  if (!settings) {
    throw new Error('App settings must be configured before using specs')
  }

  return settings
}

async function buildSpecRunPrompt(settings: AppSettings, change: SpecChangeDetail, role: AgentRole, taskIds: string[], workflowIntent: SpecWorkflowIntent): Promise<string> {
  const artifactKinds = getSpecRunArtifactKinds(role)
  const artifacts = await Promise.all(artifactKinds.map(async (artifactKind) => readOptionalSpecArtifact(settings, change.summary.id, artifactKind)))
  const selectedTasks = taskIds.length > 0
    ? change.tasks.filter((task) => taskIds.includes(task.id))
    : change.tasks

  return [
    `Continue spec change ${change.summary.id} in ${role} mode.`,
    `Workflow intent: ${workflowIntent}.`,
    `Status: ${change.summary.status}`,
    selectedTasks.length > 0
      ? ['Selected tasks:', ...selectedTasks.map((task) => `- [${task.status}] ${task.id}: ${task.title}`)].join('\n')
      : 'Selected tasks: all available tasks for this change.',
    ...artifacts.filter((artifact): artifact is { kind: SpecArtifactKind; content: string } => artifact !== null).map((artifact) => [
      `Artifact: ${artifact.kind}`,
      artifact.content,
    ].join('\n\n')),
    getSpecRunInstruction(role, workflowIntent),
    getSpecEvidenceInstruction(change.summary.id, role),
  ].join('\n\n---\n\n')
}

async function buildBenchmarkRunPrompt(settings: AppSettings, suite: string, benchmarkCase: BenchmarkCase): Promise<string> {
  const content = await readFile(resolveWorkspacePath(settings.workspace.rootPath, benchmarkCase.path), 'utf8')

  return [
    `Run Nano benchmark case ${benchmarkCase.id} from suite ${suite}.`,
    `Case title: ${benchmarkCase.title}`,
    'Follow the tracked case markdown exactly. Preserve approval gates, do not push branches or publish PRs, and keep evidence inspectable.',
    'When the case is complete, summarize pass/fail status, evidence links, validation output, changed files, approvals, and any missing criteria. Do not write benchmark result files directly unless explicitly asked through approval-gated benchmark artifact actions.',
    'Tracked case markdown:',
    content,
  ].join('\n\n---\n\n')
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'benchmark'
}

type SpecWorkflowIntent = 'propose' | 'plan' | 'build' | 'verify' | 'archive'

function getDefaultSpecWorkflowIntent(role: AgentRole): SpecWorkflowIntent {
  if (role === 'review') {
    return 'verify'
  }

  return role
}

function getSpecRunArtifactKinds(role: AgentRole): SpecArtifactKind[] {
  if (role === 'plan') {
    return ['proposal', 'design', 'tasks', 'evidence']
  }

  if (role === 'review') {
    return ['proposal', 'tasks', 'evidence']
  }

  return ['proposal', 'design', 'tasks']
}

function getSpecRunInstruction(role: AgentRole, workflowIntent: SpecWorkflowIntent): string {
  if (workflowIntent === 'propose') {
    return 'Propose or refine this spec change. Generate or update proposal, design, tasks, and delta specs through approval-gated spec artifact actions; do not edit application code.'
  }

  if (workflowIntent === 'archive') {
    return 'Archive this spec change only if the evidence shows it is ready. Review proposal, tasks, changed files, validation output, and unmet obligations first; if ready, use the approval-gated archive_spec_change action.'
  }

  if (role === 'plan') {
    return 'Plan only. Inspect context, refine the implementation approach, and keep all mutation approval-gated.'
  }

  if (role === 'review') {
    return 'Review against the spec, tasks, diff, validation output, and evidence. Surface unmet validation obligations before declaring success.'
  }

  return 'Build the selected task(s) with the smallest focused changes. Use approval-gated actions for all mutations.'
}

function getSpecEvidenceInstruction(changeId: string, role: AgentRole): string {
  return [
    `Before completing this spec run, call append_spec_evidence for changeId ${changeId} through the approval-gated action path.`,
    'Include the current run ID when available, approval request IDs or decisions observed in this run, changed files, validation command output summaries, unmet obligation IDs and reasons, and benchmark observations if present.',
    role === 'review'
      ? 'For review or verify runs, explicitly surface unmet validation obligations before declaring the spec ready.'
      : 'If evidence is missing or cannot be collected, say exactly what is missing instead of silently skipping it.',
  ].join(' ')
}

async function readOptionalSpecArtifact(settings: AppSettings, changeId: string, kind: SpecArtifactKind): Promise<{ kind: SpecArtifactKind; content: string } | null> {
  const parsedKind = specArtifactKindSchema.parse(kind)

  try {
    const artifact = await specWorkspaceService.readArtifact(settings.workspace.rootPath, {
      changeId,
      kind: parsedKind,
    })

    return { kind: parsedKind, content: artifact.content }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}
