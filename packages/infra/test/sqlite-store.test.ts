import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@libsql/client/node'
import { afterEach, describe, expect, it } from 'vitest'

import type { AppSettings, Message, RunEvent } from '@nano-harness/shared'

import { createSqliteStore } from '../src'
import { requiredDatabaseTables } from '../src/sqlite/initialize'

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (cleanupPath) => {
      await rm(cleanupPath, { recursive: true, force: true })
    }),
  )
})

describe('SqliteStore', () => {
  it('initializes the required database tables', async () => {
    const store = await createTestStore()
    const client = createClient({ url: store.paths.databaseUrl })

    try {
      const rows = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      const tableNames = rows.rows.map((row) => String(row.name))

      expect(tableNames).toEqual([...requiredDatabaseTables].sort())
    } finally {
      await client.close()
      await store.close()
    }
  })

  it('round-trips settings, provider credentials, and ordered snapshots', async () => {
    const store = await createTestStore()

    try {
      const settings: AppSettings = {
        provider: {
          provider: 'openrouter',
          model: 'x-ai/grok-4.1-fast',
          reasoning: {
            mode: 'effort',
            effort: 'low',
          },
        },
        workspace: {
          rootPath: '/workspace',
          approvalPolicy: 'on-request',
        },
      }

      await store.saveSettings(settings)
      expect(await store.getSettings()).toEqual(settings)

      expect(await store.getProviderCredentialStatus('openrouter')).toMatchObject({
        apiKeyPresent: false,
        oauthPresent: false,
        authMethods: [],
      })
      await store.saveProviderCredentialPayload('openrouter', 'api-key', 'encrypted-key')
      await store.saveProviderCredentialPayload('openrouter', 'oauth', 'encrypted-oauth')
      expect(await store.getProviderCredentialStatus('openrouter')).toMatchObject({
        apiKeyPresent: true,
        oauthPresent: true,
        authMethods: expect.arrayContaining([
          { authMethod: 'api-key', present: true },
          { authMethod: 'oauth', present: true },
        ]),
      })
      expect(await store.getEncryptedProviderCredentialPayload('openrouter', 'api-key')).toBe('encrypted-key')
      expect(await store.getEncryptedProviderCredentialPayload('openrouter', 'oauth')).toBe('encrypted-oauth')
      await store.clearProviderCredential('openrouter', 'api-key')
      expect(await store.getEncryptedProviderCredentialPayload('openrouter', 'api-key')).toBeNull()
      expect(await store.getEncryptedProviderCredentialPayload('openrouter', 'oauth')).toBe('encrypted-oauth')

      await store.saveConversation({
        id: 'conversation-1',
        title: 'First conversation',
        createdAt: '2026-04-29T10:00:00.000Z',
        updatedAt: '2026-04-29T10:00:10.000Z',
      })
      await store.saveConversation({
        id: 'conversation-2',
        title: 'Latest conversation',
        createdAt: '2026-04-29T10:01:00.000Z',
        updatedAt: '2026-04-29T10:01:10.000Z',
      })

      await store.createRun({
        id: 'run-1',
        conversationId: 'conversation-1',
        status: 'created',
        createdAt: '2026-04-29T10:00:00.000Z',
      })
      await store.createRun({
        id: 'run-2',
        conversationId: 'conversation-1',
        status: 'started',
        createdAt: '2026-04-29T10:00:05.000Z',
        startedAt: '2026-04-29T10:00:06.000Z',
      })
      await store.updateRunStatus({
        runId: 'run-1',
        status: 'failed',
        finishedAt: '2026-04-29T10:00:09.000Z',
        failureMessage: 'provider failed',
      })

      const assistantMessage: Message = {
        id: 'message-1',
        conversationId: 'conversation-1',
        runId: 'run-2',
        role: 'assistant',
        content: 'I will call the tool.',
        toolCalls: [
          {
            id: 'tool-call-1',
            actionId: 'read_file',
            input: { path: 'notes.txt' },
          },
        ],
        reasoning: 'Need local context.',
        reasoningDetails: [
          {
            type: 'reasoning.summary',
            summary: 'Reading workspace file.',
          },
        ],
        createdAt: '2026-04-29T10:00:07.000Z',
      }
      const toolMessage: Message = {
        id: 'message-2',
        conversationId: 'conversation-1',
        runId: 'run-2',
        role: 'tool',
        content: '{"path":"notes.txt","content":"hello"}',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        createdAt: '2026-04-29T10:00:08.000Z',
      }

      await store.saveMessage(assistantMessage)
      await store.saveMessage(toolMessage)

      const createdEvent: RunEvent = {
        id: 'event-1',
        runId: 'run-2',
        timestamp: '2026-04-29T10:00:05.000Z',
        type: 'run.created',
        payload: {
          run: {
            id: 'run-2',
            conversationId: 'conversation-1',
            status: 'started',
            createdAt: '2026-04-29T10:00:05.000Z',
            startedAt: '2026-04-29T10:00:06.000Z',
          },
        },
      }
      const providerEvent: RunEvent = {
        id: 'event-2',
        runId: 'run-2',
        timestamp: '2026-04-29T10:00:07.000Z',
        type: 'provider.completed',
        payload: {
          messageId: 'message-1',
        },
      }

      await store.appendEvent(createdEvent)
      await store.appendEvent(providerEvent)

      await store.saveApprovalRequest({
        id: 'approval-1',
        runId: 'run-2',
        actionCallId: 'call-1',
        reason: 'Write approval',
        requestedAt: '2026-04-29T10:00:08.500Z',
      })
      await store.saveApprovalResolution({
        approvalRequestId: 'approval-1',
        decision: 'granted',
        decidedAt: '2026-04-29T10:00:09.500Z',
      })

      expect((await store.listConversations()).map((conversation) => conversation.id)).toEqual([
        'conversation-2',
        'conversation-1',
      ])
      expect((await store.listRuns()).map((storedRun) => storedRun.id)).toEqual(['run-1', 'run-2'])
      expect((await store.listRuns(['started'])).map((storedRun) => storedRun.id)).toEqual(['run-2'])
      expect(await store.listRunEvents('run-2')).toEqual([createdEvent, providerEvent])

      const snapshot = await store.getConversation('conversation-1')
      expect(snapshot.conversation).toMatchObject({ id: 'conversation-1' })
      expect(snapshot.runs).toEqual([
        {
          id: 'run-1',
          conversationId: 'conversation-1',
          status: 'failed',
          createdAt: '2026-04-29T10:00:00.000Z',
          finishedAt: '2026-04-29T10:00:09.000Z',
          failureMessage: 'provider failed',
        },
        {
          id: 'run-2',
          conversationId: 'conversation-1',
          status: 'started',
          createdAt: '2026-04-29T10:00:05.000Z',
          startedAt: '2026-04-29T10:00:06.000Z',
        },
      ])
      expect(snapshot.messages).toEqual([assistantMessage, toolMessage])
      expect(snapshot.events).toEqual([createdEvent, providerEvent])
      expect(snapshot.approvalRequests).toEqual([
        {
          id: 'approval-1',
          runId: 'run-2',
          actionCallId: 'call-1',
          reason: 'Write approval',
          requestedAt: '2026-04-29T10:00:08.500Z',
        },
      ])
      expect(snapshot.approvalResolutions).toEqual([
        {
          approvalRequestId: 'approval-1',
          decision: 'granted',
          decidedAt: '2026-04-29T10:00:09.500Z',
        },
      ])
    } finally {
      await store.close()
    }
  })

  it('sanitizes provider credentials from exported or staged database files', async () => {
    const store = await createTestStore()
    const backupFilePath = path.join(store.paths.dataDir, 'export.db')

    try {
      await store.saveProviderCredentialPayload('openrouter', 'api-key', 'encrypted-api-key')
      await store.saveProviderCredentialPayload('openai', 'oauth', 'encrypted-oauth-token-account-claim')
      await store.backupToFile(backupFilePath)
      await store.sanitizeDatabaseFile(backupFilePath)

      const backupClient = createClient({ url: `file:${backupFilePath}` })

      try {
        const rows = await backupClient.execute('SELECT provider, auth_method, encrypted_payload FROM provider_credentials')

        expect(rows.rows).toEqual([])
      } finally {
        await backupClient.close()
      }

      expect(await store.getEncryptedProviderCredentialPayload('openrouter', 'api-key')).toBe('encrypted-api-key')
      expect(await store.getEncryptedProviderCredentialPayload('openai', 'oauth')).toBe('encrypted-oauth-token-account-claim')
    } finally {
      await store.close()
    }
  })
})

async function createTestStore() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nano-harness-sqlite-'))
  cleanupPaths.push(dataDir)
  return await createSqliteStore({ dataDir })
}
