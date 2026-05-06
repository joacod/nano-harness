import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { sessionExportResultSchema } from '../../../../packages/shared/src'
import type { DesktopRuntime } from './runtime'

type SessionExportRuntime = {
  store: Pick<DesktopRuntime['store'], 'exportSession'> & {
    paths: {
      dataDir: string
    }
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export async function exportSession(runtime: SessionExportRuntime, sessionId: string) {
  const sessionExport = await runtime.store.exportSession(sessionId)
  const exportDir = path.join(runtime.store.paths.dataDir, 'session-exports')
  const exportedFilePath = path.join(exportDir, `${sanitizeFileName(sessionId)}-session.json`)

  await mkdir(exportDir, { recursive: true })
  await writeFile(exportedFilePath, `${JSON.stringify({ exportedAt: new Date().toISOString(), ...sessionExport }, null, 2)}\n`, 'utf8')

  return sessionExportResultSchema.parse({ exportedFilePath })
}
