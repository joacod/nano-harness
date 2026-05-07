import { useMutation, useQuery } from '@tanstack/react-query'

import { contextQueryOptions } from '../../queries'
import { DataBackupPanel } from './DataBackupPanel'

export function DataSettingsTabContainer() {
  const contextQuery = useQuery(contextQueryOptions)
  const exportDataMutation = useMutation({
    mutationFn: async () => window.desktop.exportData(),
  })
  const importDataMutation = useMutation({
    mutationFn: async () => window.desktop.importData(),
  })

  return (
    <DataBackupPanel
      dataPath={contextQuery.data?.dataPath ?? null}
      dataError={exportDataMutation.error instanceof Error ? exportDataMutation.error.message : importDataMutation.error instanceof Error ? importDataMutation.error.message : null}
      exportDataResult={exportDataMutation.data?.exportedFilePath ?? null}
      importDataResult={importDataMutation.data?.backupFilePath ?? null}
      isExportingData={exportDataMutation.isPending}
      isImportingData={importDataMutation.isPending}
      onExportData={async () => {
        await exportDataMutation.mutateAsync()
      }}
      onImportData={async () => {
        await importDataMutation.mutateAsync()
      }}
    />
  )
}
