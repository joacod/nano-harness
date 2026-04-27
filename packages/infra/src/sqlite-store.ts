import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

import { createClient } from '@libsql/client/node'
import type { Client } from '@libsql/client'
import type { ConversationSnapshot, Store, UpdateRunStatusInput } from '@nano-harness/core'
import {
  appSettingsSchema,
  approvalRequestSchema,
  approvalResolutionSchema,
  conversationSchema,
  messageSchema,
  providerKeySchema,
  runStatusSchema,
  type ProviderKey,
  runEventSchema,
  runSchema,
} from '@nano-harness/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

import {
  approvalRequestsTable,
  approvalResolutionsTable,
  conversationsTable,
  messagesTable,
  providerCredentialsTable,
  runEventsTable,
  runsTable,
  schema,
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
  parseJson,
  serializeJson,
  serializeRunEvent,
} from './sqlite/serializers'

const SETTINGS_ROW_ID = 'app'

export { resolveSqliteStorePaths, type SqliteStoreOptions, type SqliteStorePaths } from './sqlite/paths'

export class SqliteStore implements Store {
  private readonly client: Client
  private readonly db
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
  }

  async listConversations() {
    const conversationRows = await this.db.select().from(conversationsTable).orderBy(asc(conversationsTable.updatedAt))
    return conversationRows.reverse().map((conversation) => conversationSchema.parse(conversation))
  }

  async listRuns(statuses?: Array<ReturnType<typeof runStatusSchema.parse>>) {
    const runRows = statuses && statuses.length > 0
      ? await this.db.select().from(runsTable).where(inArray(runsTable.status, statuses)).orderBy(asc(runsTable.createdAt))
      : await this.db.select().from(runsTable).orderBy(asc(runsTable.createdAt))

    return runRows.map((run) => runSchema.parse(normalizeNullableRunRow(run)))
  }

  async getConversation(conversationId: string): Promise<ConversationSnapshot> {
    const [conversationRow] = await this.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))

    const runRows = await this.db
      .select()
      .from(runsTable)
      .where(eq(runsTable.conversationId, conversationId))
      .orderBy(asc(runsTable.createdAt))

    const messageRows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt))

    const runIds = runRows.map((run) => run.id)
    const approvalRequests = runIds.length
      ? await this.db
          .select()
          .from(approvalRequestsTable)
          .where(inArray(approvalRequestsTable.runId, runIds))
          .orderBy(asc(approvalRequestsTable.requestedAt))
      : []

    const eventRows = runIds.length
      ? await this.db
          .select()
          .from(runEventsTable)
          .where(inArray(runEventsTable.runId, runIds))
          .orderBy(asc(runEventsTable.timestamp))
      : []

    const approvalRequestIds = approvalRequests.map((request) => request.id)
    const approvalResolutions = approvalRequestIds.length
      ? await this.db
          .select()
          .from(approvalResolutionsTable)
          .where(inArray(approvalResolutionsTable.approvalRequestId, approvalRequestIds))
          .orderBy(asc(approvalResolutionsTable.decidedAt))
      : []

    return {
      conversation: conversationRow ? conversationSchema.parse(conversationRow) : null,
      runs: runRows.map((run) => runSchema.parse(normalizeNullableRunRow(run))),
      messages: messageRows.map((message) => deserializeMessage(normalizeNullableMessageRow(message))),
      events: eventRows.map(deserializeRunEvent),
      approvalRequests: approvalRequests.map((request) => approvalRequestSchema.parse(request)),
      approvalResolutions: approvalResolutions.map((resolution) => approvalResolutionSchema.parse(resolution)),
    }
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

  async getProviderCredentialStatus(provider: ProviderKey): Promise<{ apiKeyPresent: boolean }> {
    const parsedProvider = providerKeySchema.parse(provider)
    const [credentialRow] = await this.db
      .select({ provider: providerCredentialsTable.provider })
      .from(providerCredentialsTable)
      .where(eq(providerCredentialsTable.provider, parsedProvider))

    return {
      apiKeyPresent: Boolean(credentialRow),
    }
  }

  async saveProviderCredential(provider: ProviderKey, encryptedApiKey: string): Promise<void> {
    const parsedProvider = providerKeySchema.parse(provider)
    const updatedAt = new Date().toISOString()

    await this.db
      .insert(providerCredentialsTable)
      .values({
        provider: parsedProvider,
        encryptedApiKey,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: providerCredentialsTable.provider,
        set: {
          encryptedApiKey,
          updatedAt,
        },
      })
  }

  async clearProviderCredential(provider: ProviderKey): Promise<void> {
    const parsedProvider = providerKeySchema.parse(provider)
    await this.db.delete(providerCredentialsTable).where(eq(providerCredentialsTable.provider, parsedProvider))
  }

  async getEncryptedProviderCredential(provider: ProviderKey): Promise<string | null> {
    const parsedProvider = providerKeySchema.parse(provider)
    const [credentialRow] = await this.db
      .select({ encryptedApiKey: providerCredentialsTable.encryptedApiKey })
      .from(providerCredentialsTable)
      .where(eq(providerCredentialsTable.provider, parsedProvider))

    return credentialRow?.encryptedApiKey ?? null
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

export async function createSqliteStore(options: SqliteStoreOptions = {}): Promise<SqliteStore> {
  const store = new SqliteStore(options)
  await store.initialize()
  return store
}
