import path from 'node:path'

const DEFAULT_DATA_DIR_NAME = '.nano-harness'
const DEFAULT_DATABASE_FILE_NAME = 'nano-harness.db'

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

export function toFileDatabaseUrl(databaseFilePath: string): string {
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
