import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { Toast, type ToastMessage } from '../ui'
import { contextQueryOptions } from '../../queries'
import { getFileName } from '../../utils/files'
import { DataBackupPanel } from './DataBackupPanel'

export function DataSettingsTabContainer() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const contextQuery = useQuery(contextQueryOptions)
  const exportDataMutation = useMutation({
    mutationFn: async () => window.desktop.exportData(),
    onSuccess: (result) => {
      const exportedFilePath = result.exportedFilePath

      if (!exportedFilePath) {
        return
      }

      setToast({
        id: `data-export-${Date.now()}`,
        title: 'Data exported',
        message: `Saved ${getFileName(exportedFilePath)} locally.`,
        action: {
          label: 'Open folder',
          onClick: () => {
            void window.desktop.showItemInFolder({ filePath: exportedFilePath })
          },
        },
        variant: 'success',
      })
    },
    onError: (error) => {
      setToast({
        id: `data-export-error-${Date.now()}`,
        title: 'Data export failed',
        message: error instanceof Error ? error.message : 'The app data could not be exported.',
        variant: 'error',
      })
    },
  })
  const importDataMutation = useMutation({
    mutationFn: async () => window.desktop.importData(),
  })

  return (
    <>
      <DataBackupPanel
        dataPath={contextQuery.data?.dataPath ?? null}
        dataError={importDataMutation.error instanceof Error ? importDataMutation.error.message : null}
        importDataResult={importDataMutation.data?.backupFilePath ?? null}
        isExportingData={exportDataMutation.isPending}
        isImportingData={importDataMutation.isPending}
        onExportData={() => exportDataMutation.mutate()}
        onImportData={async () => {
          await importDataMutation.mutateAsync()
        }}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}
