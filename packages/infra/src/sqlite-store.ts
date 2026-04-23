import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@libsql/client/node'
import type { Client } from '@libsql/client'
import type { ConversationSnapshot, Store, UpdateRunStatusInput } from '@nano-harness/core'
import {
  appSettingsSchema,
  approvalRequestSchema,
  approvalResolutionSchema,
  conversationSchema,
  messageSchema,
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
  runEventsTable,
  runsTable,
  schema,
  settingsTable,
} from './schema'

const SETTINGS_ROW_ID = 'app'
const DEFAULT_DATA_DIR_NAME = '.nano-harness'
const DEFAULT_DATABASE_FILE_NAME = 'nano-harness.db'

const initializationStatements = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    failure_message TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS runs_conversation_id_idx ON runs (conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    run_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS messages_run_id_idx ON messages (run_id)`,
  `CREATE TABLE IF NOT EXISTS run_events (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS run_events_run_id_idx ON run_events (run_id, timestamp)`,
  `CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    action_call_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    requested_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS approval_requests_run_id_idx ON approval_requests (run_id, requested_at)`,
  `CREATE TABLE IF NOT EXISTS approval_resolutions (
    approval_request_id TEXT PRIMARY KEY NOT NULL,
    decision TEXT NOT NULL,
    decided_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS approval_resolutions_decided_at_idx ON approval_resolutions (decided_at)`,
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const

export interface SqliteStoreOptions {
  dataDir?: string
  databaseFileName?: string
  databaseUrl?: string
}

export interface SqliteStorePaths {
  dataDir: string
  databaseFilePath: string
  databaseUrl: string
}

function toFileDatabaseUrl(databaseFilePath: string): string {
  return `file:${databaseFilePath}`
}

export function resolveSqliteStorePaths(options: SqliteStoreOptions = {}): SqliteStorePaths {
  if (options.databaseUrl) {
    return {
      dataDir: options.dataDir ?? path.join(process.cwd(), DEFAULT_DATA_DIR_NAME),
      databaseFilePath: options.databaseUrl,
      databaseUrl: options.databaseUrl,
    }
  }

  const dataDir = options.dataDir ?? path.join(process.cwd(), DEFAULT_DATA_DIR_NAME)
  const databaseFileName = options.databaseFileName ?? DEFAULT_DATABASE_FILE_NAME
  const databaseFilePath = path.join(dataDir, databaseFileName)

  return {
    dataDir,
    databaseFilePath,
    databaseUrl: toFileDatabaseUrl(databaseFilePath),
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value)
}

function serializeRunEvent(event: ReturnType<typeof runEventSchema.parse>) {
  return {
    id: event.id,
    runId: event.runId,
    type: event.type,
    timestamp: event.timestamp,
    payload: serializeJson(event.payload),
  }
}

function deserializeRunEvent(row: { id: string; runId: string; type: string; timestamp: string; payload: string }) {
  return runEventSchema.parse({
    id: row.id,
    runId: row.runId,
    type: row.type,
    timestamp: row.timestamp,
    payload: parseJson(row.payload),
  })
}

function normalizeNullableRunRow(row: {
  id: string
  conversationId: string
  status: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  failureMessage: string | null
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
  }
}

function normalizeNullableMessageRow(row: {
  id: string
  conversationId: string
  runId: string | null
  role: string
  content: string
  createdAt: string
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId ?? undefined,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  }
}

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
      messages: messageRows.map((message) => messageSchema.parse(normalizeNullableMessageRow(message))),
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

    await this.db.insert(messagesTable).values(parsedMessage)
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

  async close(): Promise<void> {
    await this.client.close()
  }
}

export async function createSqliteStore(options: SqliteStoreOptions = {}): Promise<SqliteStore> {
  const store = new SqliteStore(options)
  await store.initialize()
  return store
}
