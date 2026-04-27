export const requiredDatabaseTables = [
  'conversations',
  'runs',
  'messages',
  'run_events',
  'approval_requests',
  'approval_resolutions',
  'settings',
  'provider_credentials',
] as const

export const initializationStatements = [
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
    metadata TEXT,
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
  `CREATE TABLE IF NOT EXISTS provider_credentials (
    provider TEXT PRIMARY KEY NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
] as const
