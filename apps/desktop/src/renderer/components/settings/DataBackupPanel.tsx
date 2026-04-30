import { Button, FeedbackText } from '../ui'

export function DataBackupPanel({
  dataPath,
  dataError,
  exportDataResult,
  importDataResult,
  isExportingData,
  isImportingData,
  onExportData,
  onImportData,
}: {
  dataPath: string | null
  dataError: string | null
  exportDataResult: string | null
  importDataResult: string | null
  isExportingData: boolean
  isImportingData: boolean
  onExportData: () => Promise<void>
  onImportData: () => Promise<void>
}) {
  return (
    <section className="provider-status-card">
      <div className="sidebar-header-row">
        <div>
          <p className="eyebrow">Data</p>
          <h3>Backup and restore</h3>
        </div>
      </div>
      <dl className="summary-list data-backup-summary">
        <div>
          <dt>Database</dt>
          <dd>{dataPath ?? 'Loading data location…'}</dd>
        </div>
      </dl>
      <div className="data-backup-notices" aria-label="Backup and restore notes">
        <div className="data-backup-notice">
          <strong>Export</strong>
          <p>Includes conversations, run history, approvals, and non-sensitive settings. API keys are not included.</p>
        </div>
        <div className="data-backup-notice data-backup-notice-warning">
          <strong>Import</strong>
          <p>Replaces current app data after creating a local safety backup, then relaunches the app.</p>
        </div>
      </div>
      <div className="form-row action-row-left data-backup-actions">
        <Button
          type="button"
          variant="primary"
          disabled={isExportingData}
          onClick={() => {
            if (!window.confirm('Export Nano Harness data without API keys? Keep the backup file private.')) {
              return
            }

            void onExportData()
          }}
        >
          {isExportingData ? 'Exporting…' : 'Export data'}
        </Button>
        <Button
          type="button"
          disabled={isImportingData}
          onClick={() => {
            if (!window.confirm('Import replaces current app data and does not restore API keys. Continue?')) {
              return
            }

            void onImportData()
          }}
        >
          {isImportingData ? 'Importing…' : 'Import data'}
        </Button>
      </div>
      {exportDataResult ? (
        <FeedbackText variant="success" live>
          Exported to {exportDataResult}
        </FeedbackText>
      ) : null}
      {importDataResult ? (
        <FeedbackText variant="success" live>
          Safety backup created at {importDataResult}
        </FeedbackText>
      ) : null}
      {dataError ? (
        <FeedbackText variant="error" live>
          {dataError}
        </FeedbackText>
      ) : null}
    </section>
  )
}
