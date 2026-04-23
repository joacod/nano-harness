import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversationsTable = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const runsTable = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    status: text('status').notNull(),
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

export const schema = {
  conversationsTable,
  runsTable,
  messagesTable,
  runEventsTable,
  approvalRequestsTable,
  approvalResolutionsTable,
  settingsTable,
}
