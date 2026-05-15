// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routerMocks = vi.hoisted(() => ({
  pathname: '/specs',
  navigate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()

  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
    useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
      select({ location: { pathname: routerMocks.pathname } }),
  }
})

import { SpecsRoute } from '../../src/renderer/routes/SpecsRoute'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

describe('SpecsRoute', () => {
  beforeEach(() => {
    routerMocks.pathname = '/specs'
    routerMocks.navigate.mockReset()
  })

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
    const user = userEvent.setup()
    const startSpecRun = vi.fn(async () => ({ runId: 'run-1' }))
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
          artifactPaths: [
            { kind: 'proposal', path: '.nano/specs/changes/add-spec-workbench/proposal.md' },
            { kind: 'tasks', path: '.nano/specs/changes/add-spec-workbench/tasks.md' },
            { kind: 'evidence', path: '.nano/specs/changes/add-spec-workbench/evidence.json' },
          ],
          tasks: [{ id: 'ui', title: 'Add route', status: 'todo', validationNotes: [], sourceLine: 1 }],
          evidenceLinks: { runIds: ['run-1'], eventIds: [], approvalIds: [], changedFiles: ['router.tsx'], validationOutputs: ['pnpm typecheck passed'], benchmarkObservations: [] },
        }],
      }),
      readSpecArtifact: async (input) => ({
        kind: input.artifactKind,
        path: `.nano/specs/changes/add-spec-workbench/${input.artifactKind}.md`,
        content: input.artifactKind === 'tasks' ? '- [ ] ui: Add route\n' : '# Add Spec Workbench\n\nCreate a visible specs screen.\n',
      }),
      startSpecRun,
    })

    renderWithQueryClient(<SpecsRoute />)

    expect(await screen.findByText('1 active')).toBeTruthy()
    expect((await screen.findAllByText('Add Spec Workbench')).length).toBeGreaterThan(0)
    expect(await screen.findByText('ui: Add route')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Tasks' }))

    expect(await screen.findByText('.nano/specs/changes/add-spec-workbench/tasks.md')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Build selected task' }))

    await waitFor(() => {
      expect(startSpecRun).toHaveBeenCalledWith({
        conversationId: expect.stringMatching(/^conversation-/),
        changeId: 'add-spec-workbench',
        role: 'build',
        taskIds: ['ui'],
      })
    })
    await waitFor(() => {
      expect(routerMocks.navigate).toHaveBeenCalledWith({
        to: '/conversations/$conversationId',
        params: { conversationId: expect.stringMatching(/^conversation-/) },
      })
    })
  })
})
