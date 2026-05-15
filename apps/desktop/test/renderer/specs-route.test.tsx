// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SpecsRoute } from '../../src/renderer/routes/SpecsRoute'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

describe('SpecsRoute', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the empty spec workbench skeleton', async () => {
    window.desktop = createDesktopMock({
      listSpecChanges: async () => ({ changes: [] }),
    })

    renderWithQueryClient(<SpecsRoute />)

    expect(await screen.findByText('Spec Workbench')).toBeTruthy()
    expect(await screen.findByText(/No spec changes yet/i)).toBeTruthy()
  })

  it('shows active spec count and local changes', async () => {
    window.desktop = createDesktopMock({
      listSpecChanges: async () => ({
        changes: [{
          summary: {
            id: 'add-spec-workbench',
            title: 'Add Spec Workbench',
            status: 'proposed',
            path: '.nano/specs/changes/add-spec-workbench',
            taskCounts: { total: 1, todo: 1, inProgress: 0, done: 0, blocked: 0 },
            updatedAt: '2026-05-14T10:00:00.000Z',
            linkedRunIds: [],
          },
          artifactPaths: [],
          tasks: [],
          evidenceLinks: { runIds: [], eventIds: [], approvalIds: [], changedFiles: [], validationOutputs: [], benchmarkObservations: [] },
        }],
      }),
    })

    renderWithQueryClient(<SpecsRoute />)

    expect(await screen.findByText('1 active')).toBeTruthy()
    expect(await screen.findByText('Add Spec Workbench')).toBeTruthy()
  })
})
