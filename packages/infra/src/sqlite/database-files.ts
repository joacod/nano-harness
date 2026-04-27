import { copyFile, rm } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@libsql/client/node'
import type { Client } from '@libsql/client'

import { requiredDatabaseTables } from './initialize'
import { toFileDatabaseUrl } from './paths'
import { quoteSqliteString } from './serializers'

export async function backupDatabaseToFile(client: Client, filePath: string): Promise<void> {
  await rm(filePath, { force: true })
  await client.execute(`VACUUM INTO ${quoteSqliteString(filePath)}`)
}

export async function validateDatabaseFile(filePath: string): Promise<void> {
  const validationClient = createClient({ url: toFileDatabaseUrl(filePath) })

  try {
    const result = await validationClient.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredDatabaseTables.map(quoteSqliteString).join(', ')})`,
    )
    const tableNames = new Set(result.rows.map((row) => String(row['name'])))
    const missingTables = requiredDatabaseTables.filter((tableName) => !tableNames.has(tableName))

    if (missingTables.length > 0) {
      throw new Error(`Selected file is not a valid Nano Harness database. Missing tables: ${missingTables.join(', ')}`)
    }
  } finally {
    await validationClient.close()
  }
}

export async function sanitizeDatabaseFile(filePath: string): Promise<void> {
  const sanitizeClient = createClient({ url: toFileDatabaseUrl(filePath) })

  try {
    await sanitizeClient.execute('DELETE FROM provider_credentials')
  } finally {
    await sanitizeClient.close()
  }
}

export async function createStagedImportCopy(input: {
  dataDir: string
  sourceFilePath: string
  now?: () => number
}): Promise<string> {
  const stagedFilePath = path.join(input.dataDir, `nano-harness-import-${input.now?.() ?? Date.now()}.db`)
  await copyFile(input.sourceFilePath, stagedFilePath)
  return stagedFilePath
}
