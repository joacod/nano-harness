// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DataBackupPanel } from '../../src/renderer/components/settings/DataBackupPanel'

describe('DataBackupPanel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('does not run export or import when confirmation is declined', async () => {
    const user = userEvent.setup()
    const onExportData = vi.fn(async () => undefined)
    const onImportData = vi.fn(async () => undefined)
    const confirm = vi.fn(() => false)

    vi.stubGlobal('confirm', confirm)

    render(
      <DataBackupPanel
        dataPath="/Users/test/Library/Application Support/nano-harness.db"
        dataError={null}
        exportDataResult={null}
        importDataResult={null}
        isExportingData={false}
        isImportingData={false}
        onExportData={onExportData}
        onImportData={onImportData}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Export data' }))
    await user.click(screen.getByRole('button', { name: 'Import data' }))

    expect(confirm).toHaveBeenCalledTimes(2)
    expect(onExportData).not.toHaveBeenCalled()
    expect(onImportData).not.toHaveBeenCalled()
  })

  it('runs export and import when both confirmations are accepted', async () => {
    const user = userEvent.setup()
    const onExportData = vi.fn(async () => undefined)
    const onImportData = vi.fn(async () => undefined)

    vi.stubGlobal('confirm', vi.fn(() => true))

    render(
      <DataBackupPanel
        dataPath="/Users/test/Library/Application Support/nano-harness.db"
        dataError={null}
        exportDataResult={null}
        importDataResult={null}
        isExportingData={false}
        isImportingData={false}
        onExportData={onExportData}
        onImportData={onImportData}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Export data' }))
    await user.click(screen.getByRole('button', { name: 'Import data' }))

    await waitFor(() => {
      expect(onExportData).toHaveBeenCalledTimes(1)
      expect(onImportData).toHaveBeenCalledTimes(1)
    })
  })

  it('renders backup results and data errors', () => {
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(
      <DataBackupPanel
        dataPath="/Users/test/Library/Application Support/nano-harness.db"
        dataError="Import failed"
        exportDataResult="/tmp/nano-harness-export.zip"
        importDataResult="/tmp/nano-harness-safety-backup.zip"
        isExportingData={false}
        isImportingData={false}
        onExportData={vi.fn(async () => undefined)}
        onImportData={vi.fn(async () => undefined)}
      />,
    )

    expect(screen.getByText('Exported to /tmp/nano-harness-export.zip')).toBeTruthy()
    expect(screen.getByText('Safety backup created at /tmp/nano-harness-safety-backup.zip')).toBeTruthy()
    expect(screen.getByText('Import failed')).toBeTruthy()
  })
})
