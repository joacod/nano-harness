import { mkdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createClient } from '@libsql/client/node'
import type { Client } from '@libsql/client'
import type { ConversationSnapshot, Store, UpdateRunStatusInput } from '@nano-harness/core'
import {
  appSettingsSchema,
  approvalRequestSchema,
  approvalResolutionSchema,
  type Conversation,
  conversationSchema,
  messageSchema,
  memoryProposalSchema,
  type MemoryProposal,
  memoryRecordSchema,
  memorySettingsSchema,
  sessionExportSchema,
  sessionSchema,
  providerKeySchema,
  providerAuthMethodSchema,
  runStatusSchema,
  type ProviderAuthMethod,
  type ProviderKey,
  runEventSchema,
  runSchema,
} from '@nano-harness/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

import {
  approvalRequestsTable,
  approvalResolutionsTable,
  conversationsTable,
  memoryProposalsTable,
  memoryRecordsTable,
  messagesTable,
  providerCredentialsTable,
  runEventsTable,
  runsTable,
  schema,
  sessionsTable,
  settingsTable,
} from './schema'
import { backupDatabaseToFile, createStagedImportCopy, sanitizeDatabaseFile, validateDatabaseFile } from './sqlite/database-files'
import { initializationStatements } from './sqlite/initialize'
import { deserializeMessage, serializeMessageMetadata } from './sqlite/message-metadata'
import { resolveSqliteStorePaths, type SqliteStoreOptions, type SqliteStorePaths } from './sqlite/paths'
import {
  deserializeRunEvent,
  normalizeNullableMessageRow,
  normalizeNullableRunRow,
  normalizeNullableSessionRow,
  parseJson,
  serializeJson,
  serializeRunEvent,
} from './sqlite/serializers'

const SETTINGS_ROW_ID = 'app'

type Database = ReturnType<typeof drizzle<typeof schema>>

export { resolveSqliteStorePaths, type SqliteStoreOptions, type SqliteStorePaths } from './sqlite/paths'

export class SqliteStore implements Store {
  private readonly client: Client
  private readonly db: Database
  readonly paths: SqliteStorePaths

  constructor(options: SqliteStoreOptions = {}) {
    this.paths = resolveSqliteStorePaths(options)

    if (this.paths.databaseUrl.startsWith('file:')) {
      mkdirSync(this.paths.dataDir, { recursive: true })
    }

    this.client = createClient({ url: this.paths.databaseUrl })
    this.db = drizzle(this.client, { schema })
  }

  async initialize(): Promise<void> {
    if (!this.paths.databaseUrl.startsWith('file:')) {
      return
    }

    await mkdir(this.paths.dataDir, { recursive: true })

    for (const statement of initializationStatements) {
      await this.client.execute(statement)
    }
  }

  async saveConversation(conversation: Parameters<typeof conversationSchema.parse>[0]): Promise<void> {
    const parsedConversation = conversationSchema.parse(conversation)

    await this.db
      .insert(conversationsTable)
      .values(parsedConversation)
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          title: parsedConversation.title,
          createdAt: parsedConversation.createdAt,
          updatedAt: parsedConversation.updatedAt,
        },
      })

    await this.ensureSessionForConversation(parsedConversation)
  }

  private async ensureSessionForConversation(conversation: Conversation): Promise<void> {
    const [existingSession] = await this.db.select().from(sessionsTable).where(eq(sessionsTable.conversationId, conversation.id))

    if (existingSession) {
      await this.db.update(sessionsTable).set({ title: conversation.title, updatedAt: conversation.updatedAt }).where(eq(sessionsTable.id, existingSession.id))
      return
    }

    const session = sessionSchema.parse({
      id: conversation.id,
      conversationId: conversation.id,
      parentSessionId: null,
      rootSessionId: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })

    await this.db.insert(sessionsTable).values(session)
  }

  async listConversations() {
    const conversationRows = await this.db.select().from(conversationsTable).orderBy(asc(conversationsTable.updatedAt))
    return conversationRows.reverse().map((conversation) => conversationSchema.parse(conversation))
  }

  async listSessions() {
    const sessionRows = await this.db.select().from(sessionsTable).orderBy(asc(sessionsTable.createdAt))
    return sessionRows.map((session) => sessionSchema.parse(normalizeNullableSessionRow(session)))
  }

  async forkSession(sessionId: string) {
    return await this.createChildSession(sessionId, 'Fork')
  }

  async cloneSession(sessionId: string) {
    return await this.createChildSession(sessionId, 'Clone')
  }

  private async createChildSession(sessionId: string, label: string) {
    const [parentRow] = await this.db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId))

    if (!parentRow) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const parent = sessionSchema.parse(normalizeNullableSessionRow(parentRow))
    const now = new Date().toISOString()
    const childId = `${parent.id}-${label.toLowerCase()}-${Date.now().toString(36)}`
    const conversation = conversationSchema.parse({
      id: childId,
      title: `${parent.title} (${label})`,
      createdAt: now,
      updatedAt: now,
    })
    const session = sessionSchema.parse({
      id: childId,
      conversationId: childId,
      parentSessionId: parent.id,
      rootSessionId: parent.rootSessionId,
      title: conversation.title,
      createdAt: now,
      updatedAt: now,
    })

    await this.db.insert(conversationsTable).values(conversation)
    await this.db.insert(sessionsTable).values(session)

    return session
  }

  async exportSession(sessionId: string) {
    const [sessionRow] = await this.db.select().from(sessionsTable).where(eq(sessionsTable.id, sessionId))

    if (!sessionRow) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const session = sessionSchema.parse(normalizeNullableSessionRow(sessionRow))
    const snapshot = await this.getConversation(session.conversationId)
    const lineageRows = await this.db.select().from(sessionsTable).where(eq(sessionsTable.rootSessionId, session.rootSessionId)).orderBy(asc(sessionsTable.createdAt))

    return sessionExportSchema.parse({
      session,
      lineage: lineageRows.map((row) => sessionSchema.parse(normalizeNullableSessionRow(row))),
      runs: snapshot.runs,
      messages: snapshot.messages,
      events: snapshot.events,
      approvals: {
        requests: snapshot.approvalRequests,
        resolutions: snapshot.approvalResolutions,
      },
    })
  }

  async listRuns(statuses?: Array<ReturnType<typeof runStatusSchema.parse>>) {
    const runRows = statuses && statuses.length > 0
      ? await this.db.select().from(runsTable).where(inArray(runsTable.status, statuses)).orderBy(asc(runsTable.createdAt))
      : await this.db.select().from(runsTable).orderBy(asc(runsTable.createdAt))

    return runRows.map((run) => runSchema.parse(normalizeNullableRunRow(run)))
  }

  async getConversation(conversationId: string): Promise<ConversationSnapshot> {
    const conversationRow = await this.getConversationRow(conversationId)
    const runRows = await this.listRunRowsForConversation(conversationId)
    const messageRows = await this.listMessageRowsForConversation(conversationId)
    const runIds = runRows.map((run) => run.id)
    const approvalRequests = await this.listApprovalRequestRowsForRuns(runIds)
    const eventRows = await this.listEventRowsForRuns(runIds)
    const approvalRequestIds = approvalRequests.map((request) => request.id)
    const approvalResolutions = await this.listApprovalResolutionRowsForRequests(approvalRequestIds)

    return {
      conversation: conversationRow ? conversationSchema.parse(conversationRow) : null,
      runs: runRows.map((run) => runSchema.parse(normalizeNullableRunRow(run))),
      messages: messageRows.map((message) => deserializeMessage(normalizeNullableMessageRow(message))),
      events: eventRows.map(deserializeRunEvent),
      approvalRequests: approvalRequests.map((request) => approvalRequestSchema.parse(request)),
      approvalResolutions: approvalResolutions.map((resolution) => approvalResolutionSchema.parse(resolution)),
    }
  }

  private async getConversationRow(conversationId: string) {
    const [conversationRow] = await this.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))

    return conversationRow ?? null
  }

  private async listRunRowsForConversation(conversationId: string) {
    return await this.db
      .select()
      .from(runsTable)
      .where(eq(runsTable.conversationId, conversationId))
      .orderBy(asc(runsTable.createdAt))
  }

  private async listMessageRowsForConversation(conversationId: string) {
    return await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt))
  }

  private async listApprovalRequestRowsForRuns(runIds: string[]) {
    return runIds.length
      ? await this.db
          .select()
          .from(approvalRequestsTable)
          .where(inArray(approvalRequestsTable.runId, runIds))
          .orderBy(asc(approvalRequestsTable.requestedAt))
      : []
  }

  private async listEventRowsForRuns(runIds: string[]) {
    return runIds.length
      ? await this.db
          .select()
          .from(runEventsTable)
          .where(inArray(runEventsTable.runId, runIds))
          .orderBy(asc(runEventsTable.timestamp))
      : []
  }

  private async listApprovalResolutionRowsForRequests(approvalRequestIds: string[]) {
    return approvalRequestIds.length
      ? await this.db
          .select()
          .from(approvalResolutionsTable)
          .where(inArray(approvalResolutionsTable.approvalRequestId, approvalRequestIds))
          .orderBy(asc(approvalResolutionsTable.decidedAt))
      : []
  }

  async createRun(run: Parameters<typeof runSchema.parse>[0]): Promise<void> {
    const parsedRun = runSchema.parse(run)

    await this.db.insert(runsTable).values(parsedRun)
  }

  async getRun(runId: string) {
    const [runRow] = await this.db.select().from(runsTable).where(eq(runsTable.id, runId))
    return runRow ? runSchema.parse(normalizeNullableRunRow(runRow)) : null
  }

  async updateRunStatus(input: UpdateRunStatusInput): Promise<void> {
    const changes: {
      status: string
      role?: string
      startedAt?: string
      finishedAt?: string
      failureMessage?: string
    } = {
      status: input.status,
    }

    if (input.startedAt !== undefined) {
      changes.startedAt = input.startedAt
    }

    if (input.finishedAt !== undefined) {
      changes.finishedAt = input.finishedAt
    }

    if (input.failureMessage !== undefined) {
      changes.failureMessage = input.failureMessage
    }

    await this.db.update(runsTable).set(changes).where(eq(runsTable.id, input.runId))
  }

  async saveMessage(message: Parameters<typeof messageSchema.parse>[0]): Promise<void> {
    const parsedMessage = messageSchema.parse(message)

    await this.db.insert(messagesTable).values({
      id: parsedMessage.id,
      conversationId: parsedMessage.conversationId,
      runId: parsedMessage.runId,
      role: parsedMessage.role,
      content: parsedMessage.content,
      metadata: serializeMessageMetadata(parsedMessage),
      createdAt: parsedMessage.createdAt,
    })
  }

  async appendEvent(event: Parameters<typeof runEventSchema.parse>[0]): Promise<void> {
    const parsedEvent = runEventSchema.parse(event)

    await this.db.insert(runEventsTable).values(serializeRunEvent(parsedEvent))
  }

  async listRunEvents(runId: string) {
    const eventRows = await this.db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .orderBy(asc(runEventsTable.timestamp))

    return eventRows.map(deserializeRunEvent)
  }

  async recallMemory(input: { query: string; settings: Parameters<typeof appSettingsSchema.parse>[0] }) {
    const parsedSettings = appSettingsSchema.parse(input.settings)
    const memorySettings = memorySettingsSchema.parse(parsedSettings.memory ?? {})

    if (!memorySettings.enabled || memorySettings.maxSnippets === 0) {
      return { selected: [], excludedCategories: memorySettings.enabledCategories }
    }

    const rows = await this.db.select().from(memoryRecordsTable).orderBy(asc(memoryRecordsTable.updatedAt))
    const enabledCategories = new Set(memorySettings.enabledCategories)
    const terms = input.query.toLowerCase().split(/\s+/).filter((term) => term.length > 2)
    const records = rows
      .map((row) => memoryRecordSchema.parse({
        ...row,
        runId: row.runId ?? undefined,
        confidence: Number.parseFloat(row.confidence),
      }))
      .filter((record) => enabledCategories.has(record.category))
      .map((record) => ({ record, score: scoreMemoryRecord(record.content, terms) }))
      .filter((item) => item.score > 0 || terms.length === 0)
      .sort((left, right) => right.score - left.score || right.record.updatedAt.localeCompare(left.record.updatedAt))
      .slice(0, memorySettings.maxSnippets)
      .map((item) => item.record)
    const excludedCategories = memorySettingsSchema.parse({}).enabledCategories.filter((category) => !enabledCategories.has(category))

    return { selected: records, excludedCategories }
  }

  async listMemoryRecords() {
    const rows = await this.db.select().from(memoryRecordsTable).orderBy(asc(memoryRecordsTable.updatedAt))
    return rows.reverse().map((row) => memoryRecordSchema.parse({
      ...row,
      runId: row.runId ?? undefined,
      confidence: Number.parseFloat(row.confidence),
    }))
  }

  async listMemoryProposals(status?: MemoryProposal['status']) {
    const rows = status
      ? await this.db.select().from(memoryProposalsTable).where(eq(memoryProposalsTable.status, status)).orderBy(asc(memoryProposalsTable.createdAt))
      : await this.db.select().from(memoryProposalsTable).orderBy(asc(memoryProposalsTable.createdAt))

    return rows.reverse().map((row) => memoryProposalSchema.parse({
      ...row,
      decidedAt: row.decidedAt ?? undefined,
      evidence: parseJson(row.evidence),
    }))
  }

  async saveMemoryProposal(proposal: Parameters<typeof memoryProposalSchema.parse>[0]): Promise<void> {
    const parsedProposal = memoryProposalSchema.parse(proposal)

    await this.db
      .insert(memoryProposalsTable)
      .values({
        ...parsedProposal,
        decidedAt: parsedProposal.decidedAt,
        evidence: serializeJson(parsedProposal.evidence),
      })
      .onConflictDoUpdate({
        target: memoryProposalsTable.id,
        set: {
          category: parsedProposal.category,
          content: parsedProposal.content,
          rationale: parsedProposal.rationale,
          evidence: serializeJson(parsedProposal.evidence),
          status: parsedProposal.status,
          decidedAt: parsedProposal.decidedAt,
        },
      })
  }

  async resolveMemoryProposal(input: { proposalId: string; decision: 'approved' | 'rejected' }) {
    const [proposalRow] = await this.db.select().from(memoryProposalsTable).where(eq(memoryProposalsTable.id, input.proposalId))

    if (!proposalRow) {
      throw new Error(`Memory proposal ${input.proposalId} not found`)
    }

    const proposal = memoryProposalSchema.parse({
      ...proposalRow,
      decidedAt: proposalRow.decidedAt ?? undefined,
      evidence: parseJson(proposalRow.evidence),
    })
    const now = new Date().toISOString()
    const resolvedProposal = memoryProposalSchema.parse({ ...proposal, status: input.decision, decidedAt: now })

    await this.saveMemoryProposal(resolvedProposal)

    if (input.decision === 'approved') {
      const record = memoryRecordSchema.parse({
        id: `memory-${proposal.id}`,
        category: proposal.category,
        content: proposal.content,
        source: `proposal:${proposal.id}`,
        runId: proposal.runId,
        confidence: 0.8,
        createdAt: now,
        updatedAt: now,
      })

      await this.db.insert(memoryRecordsTable).values({
        ...record,
        confidence: record.confidence.toString(),
      })
      await this.writeMemoryFiles(await this.listMemoryRecords())
    }

    return resolvedProposal
  }

  private async writeMemoryFiles(records: Array<ReturnType<typeof memoryRecordSchema.parse>>): Promise<void> {
    const userRecords = records.filter((record) => record.category === 'preference')
    const projectRecords = records.filter((record) => record.category !== 'preference')

    await writeFile(join(this.paths.dataDir, 'USER.md'), formatMemoryMarkdown('User Memory', userRecords), 'utf8')
    await writeFile(join(this.paths.dataDir, 'MEMORY.md'), formatMemoryMarkdown('Project Memory', projectRecords), 'utf8')
  }

  async saveApprovalRequest(request: Parameters<typeof approvalRequestSchema.parse>[0]): Promise<void> {
    const parsedRequest = approvalRequestSchema.parse(request)

    await this.db.insert(approvalRequestsTable).values(parsedRequest)
  }

  async saveApprovalResolution(resolution: Parameters<typeof approvalResolutionSchema.parse>[0]): Promise<void> {
    const parsedResolution = approvalResolutionSchema.parse(resolution)

    await this.db
      .insert(approvalResolutionsTable)
      .values(parsedResolution)
      .onConflictDoUpdate({
        target: approvalResolutionsTable.approvalRequestId,
        set: {
          decision: parsedResolution.decision,
          decidedAt: parsedResolution.decidedAt,
        },
      })
  }

  async getSettings() {
    const [settingsRow] = await this.db.select().from(settingsTable).where(eq(settingsTable.id, SETTINGS_ROW_ID))

    if (!settingsRow) {
      return null
    }

    return appSettingsSchema.parse(parseJson(settingsRow.payload))
  }

  async saveSettings(settings: Parameters<typeof appSettingsSchema.parse>[0]): Promise<void> {
    const parsedSettings = appSettingsSchema.parse(settings)

    await this.db
      .insert(settingsTable)
      .values({
        id: SETTINGS_ROW_ID,
        payload: serializeJson(parsedSettings),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: {
          payload: serializeJson(parsedSettings),
          updatedAt: new Date().toISOString(),
        },
      })
  }

  async getProviderCredentialStatus(provider: ProviderKey): Promise<{
    apiKeyPresent: boolean
    oauthPresent?: boolean
    authMethods?: Array<{ authMethod: ProviderAuthMethod; present: boolean }>
  }> {
    const parsedProvider = providerKeySchema.parse(provider)
    const credentialRows = await this.db
      .select({ authMethod: providerCredentialsTable.authMethod })
      .from(providerCredentialsTable)
      .where(eq(providerCredentialsTable.provider, parsedProvider))
    const authMethods = credentialRows.map((row) => ({
      authMethod: providerAuthMethodSchema.parse(row.authMethod),
      present: true,
    }))

    return {
      apiKeyPresent: authMethods.some((credential) => credential.authMethod === 'api-key'),
      oauthPresent: authMethods.some((credential) => credential.authMethod === 'oauth'),
      authMethods,
    }
  }

  async saveProviderCredentialPayload(
    provider: ProviderKey,
    authMethod: ProviderAuthMethod,
    encryptedPayload: string,
  ): Promise<void> {
    const parsedProvider = providerKeySchema.parse(provider)
    const parsedAuthMethod = providerAuthMethodSchema.parse(authMethod)
    const updatedAt = new Date().toISOString()

    await this.db
      .insert(providerCredentialsTable)
      .values({
        provider: parsedProvider,
        authMethod: parsedAuthMethod,
        encryptedPayload,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [providerCredentialsTable.provider, providerCredentialsTable.authMethod],
        set: {
          encryptedPayload,
          updatedAt,
        },
      })
  }

  async clearProviderCredential(provider: ProviderKey, authMethod: ProviderAuthMethod): Promise<void> {
    const parsedProvider = providerKeySchema.parse(provider)
    const parsedAuthMethod = providerAuthMethodSchema.parse(authMethod)
    await this.db.delete(providerCredentialsTable).where(
      and(
        eq(providerCredentialsTable.provider, parsedProvider),
        eq(providerCredentialsTable.authMethod, parsedAuthMethod),
      ),
    )
  }

  async getEncryptedProviderCredentialPayload(
    provider: ProviderKey,
    authMethod: ProviderAuthMethod,
  ): Promise<string | null> {
    const parsedProvider = providerKeySchema.parse(provider)
    const parsedAuthMethod = providerAuthMethodSchema.parse(authMethod)
    const [credentialRow] = await this.db
      .select({ encryptedPayload: providerCredentialsTable.encryptedPayload })
      .from(providerCredentialsTable)
      .where(
        and(
          eq(providerCredentialsTable.provider, parsedProvider),
          eq(providerCredentialsTable.authMethod, parsedAuthMethod),
        ),
      )

    return credentialRow?.encryptedPayload ?? null
  }

  async backupToFile(filePath: string): Promise<void> {
    await backupDatabaseToFile(this.client, filePath)
  }

  async validateDatabaseFile(filePath: string): Promise<void> {
    await validateDatabaseFile(filePath)
  }

  async sanitizeDatabaseFile(filePath: string): Promise<void> {
    await sanitizeDatabaseFile(filePath)
  }

  async createStagedImportCopy(sourceFilePath: string): Promise<string> {
    return createStagedImportCopy({
      dataDir: this.paths.dataDir,
      sourceFilePath,
    })
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}

function scoreMemoryRecord(content: string, terms: string[]): number {
  if (terms.length === 0) {
    return 1
  }

  const normalized = content.toLowerCase()
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0)
}

function formatMemoryMarkdown(title: string, records: Array<ReturnType<typeof memoryRecordSchema.parse>>): string {
  const lines = [`# ${title}`, '']

  if (records.length === 0) {
    lines.push('_No approved memory yet._')
  } else {
    for (const record of records) {
      lines.push(`- [${record.category}] ${record.content}`)
      lines.push(`  - Source: ${record.source}; updated: ${record.updatedAt}; confidence: ${record.confidence}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}


export async function createSqliteStore(options: SqliteStoreOptions = {}): Promise<SqliteStore> {
  const store = new SqliteStore(options)
  await store.initialize()
  return store
}
