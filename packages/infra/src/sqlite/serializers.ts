import { runEventSchema } from '@nano-harness/shared'

export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value)
}

export function quoteSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function serializeRunEvent(event: ReturnType<typeof runEventSchema.parse>) {
  return {
    id: event.id,
    runId: event.runId,
    type: event.type,
    timestamp: event.timestamp,
    payload: serializeJson(event.payload),
  }
}

export function deserializeRunEvent(row: { id: string; runId: string; type: string; timestamp: string; payload: string }) {
  return runEventSchema.parse({
    id: row.id,
    runId: row.runId,
    type: row.type,
    timestamp: row.timestamp,
    payload: parseJson(row.payload),
  })
}

export function normalizeNullableRunRow(row: {
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

export function normalizeNullableMessageRow(row: {
  id: string
  conversationId: string
  runId: string | null
  role: string
  content: string
  metadata: string | null
  createdAt: string
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    runId: row.runId ?? undefined,
    role: row.role,
    content: row.content,
    metadata: row.metadata ?? undefined,
    createdAt: row.createdAt,
  }
}
