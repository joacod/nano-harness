import { app, dialog } from 'electron'
import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { DesktopRuntime } from './runtime'

const ACTIVE_RUN_STATUSES = ['created', 'started', 'waiting_approval'] as const

function getBackupFileName(date = new Date()): string {
  return `nano-harness-backup-${date.toISOString().slice(0, 10)}.db`
}

function getTimestampedBackupFileName(date = new Date()): string {
  return `nano-harness-safety-backup-${date.toISOString().replaceAll(':', '-').replaceAll('.', '-')}.db`
}

export async function exportData(runtime: DesktopRuntime) {
  const result = await dialog.showSaveDialog({
    title: 'Export Nano Harness data',
    defaultPath: getBackupFileName(),
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
  })

  if (result.canceled || !result.filePath) {
    return { exportedFilePath: null }
  }

  await runtime.store.backupToFile(result.filePath)
  await runtime.store.sanitizeDatabaseFile(result.filePath)

  return { exportedFilePath: result.filePath }
}

export async function importData(runtime: DesktopRuntime) {
  const activeRuns = await runtime.store.listRuns([...ACTIVE_RUN_STATUSES])

  if (activeRuns.length > 0) {
    throw new Error('Import is unavailable while runs are active. Cancel or wait for active runs before importing data.')
  }

  const result = await dialog.showOpenDialog({
    title: 'Import Nano Harness data',
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false }
  }

  const [selectedFilePath] = result.filePaths
  const backupFilePath = join(runtime.store.paths.dataDir, getTimestampedBackupFileName())

  if (!selectedFilePath) {
    return { imported: false }
  }

  await runtime.store.validateDatabaseFile(selectedFilePath)
  await runtime.store.backupToFile(backupFilePath)
  const stagedFilePath = await runtime.store.createStagedImportCopy(selectedFilePath)

  try {
    await runtime.store.sanitizeDatabaseFile(stagedFilePath)
    await runtime.store.validateDatabaseFile(stagedFilePath)
    await runtime.store.close()
    await copyFile(stagedFilePath, runtime.store.paths.databaseFilePath)
  } finally {
    await rm(stagedFilePath, { force: true })
  }

  app.relaunch()
  app.exit(0)

  return { imported: true, backupFilePath }
}
