import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversationsTable = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const sessionsTable = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    parentSessionId: text('parent_session_id'),
    rootSessionId: text('root_session_id').notNull(),
    title: text('title').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('sessions_root_session_id_idx').on(table.rootSessionId, table.createdAt)],
)

export const runsTable = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    status: text('status').notNull(),
    role: text('role').notNull().default('build'),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    failureMessage: text('failure_message'),
  },
  (table) => [index('runs_conversation_id_idx').on(table.conversationId, table.createdAt)],
)

export const messagesTable = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    runId: text('run_id'),
    role: text('role').notNull(),
    content: text('content').notNull(),
    metadata: text('metadata'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId, table.createdAt),
    index('messages_run_id_idx').on(table.runId),
  ],
)

export const runEventsTable = sqliteTable(
  'run_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    type: text('type').notNull(),
    timestamp: text('timestamp').notNull(),
    payload: text('payload').notNull(),
  },
  (table) => [index('run_events_run_id_idx').on(table.runId, table.timestamp)],
)

export const approvalRequestsTable = sqliteTable(
  'approval_requests',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    actionCallId: text('action_call_id').notNull(),
    reason: text('reason').notNull(),
    requestedAt: text('requested_at').notNull(),
  },
  (table) => [index('approval_requests_run_id_idx').on(table.runId, table.requestedAt)],
)

export const approvalResolutionsTable = sqliteTable(
  'approval_resolutions',
  {
    approvalRequestId: text('approval_request_id').primaryKey(),
    decision: text('decision').notNull(),
    decidedAt: text('decided_at').notNull(),
  },
  (table) => [index('approval_resolutions_decided_at_idx').on(table.decidedAt)],
)

export const settingsTable = sqliteTable('settings', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const memoryRecordsTable = sqliteTable(
  'memory_records',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    content: text('content').notNull(),
    source: text('source').notNull(),
    runId: text('run_id'),
    confidence: text('confidence').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('memory_records_category_updated_at_idx').on(table.category, table.updatedAt)],
)

export const memoryProposalsTable = sqliteTable(
  'memory_proposals',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    category: text('category').notNull(),
    content: text('content').notNull(),
    rationale: text('rationale').notNull(),
    evidence: text('evidence').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (table) => [index('memory_proposals_status_created_at_idx').on(table.status, table.createdAt)],
)

export const providerCredentialsTable = sqliteTable(
  'provider_credentials',
  {
    provider: text('provider').notNull(),
    authMethod: text('auth_method').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.authMethod] })],
)

export const schema = {
  conversationsTable,
  sessionsTable,
  runsTable,
  messagesTable,
  runEventsTable,
  approvalRequestsTable,
  approvalResolutionsTable,
  settingsTable,
  memoryRecordsTable,
  memoryProposalsTable,
  providerCredentialsTable,
}
