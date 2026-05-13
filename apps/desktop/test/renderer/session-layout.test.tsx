// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionLayout } from '../../src/renderer/components/SessionLayout'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

describe('SessionLayout', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('moves session actions into the options menu', async () => {
    const user = userEvent.setup()
    const onForkSession = vi.fn()
    const onCloneSession = vi.fn()
    const onExportSession = vi.fn()

    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <SessionLayout
        conversationId="conversation-1"
        showTechnicalInfo={false}
        title="Session title"
        onForkSession={onForkSession}
        onCloneSession={onCloneSession}
        onExportSession={onExportSession}
      />,
    )

    const optionsButton = screen.getByRole('button', { name: 'Session options' })
    expect(screen.queryByRole('button', { name: 'Fork' })).toBeNull()

    await user.click(optionsButton)

    const menu = screen.getByRole('menu', { name: 'Session options' })
    await user.click(within(menu).getByRole('menuitem', { name: 'Clone' }))

    expect(onCloneSession).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu', { name: 'Session options' })).toBeNull()
    expect(onForkSession).not.toHaveBeenCalled()
    expect(onExportSession).not.toHaveBeenCalled()
  })

  it('hides session options before a session exists', () => {
    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <SessionLayout
        conversationId={null}
        showTechnicalInfo={false}
        title="Start new session"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Session options' })).toBeNull()
  })

  it('closes the session options menu with Escape', async () => {
    const user = userEvent.setup()

    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <SessionLayout
        conversationId="conversation-1"
        showTechnicalInfo={false}
        title="Session title"
        onForkSession={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Session options' }))
    expect(screen.getByRole('menu', { name: 'Session options' })).toBeTruthy()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Session options' })).toBeNull()
    })
  })

  it('opens the session options menu while actions are pending', async () => {
    const user = userEvent.setup()
    const onForkSession = vi.fn()

    window.desktop = createDesktopMock()

    renderWithQueryClient(
      <SessionLayout
        conversationId="conversation-1"
        showTechnicalInfo={false}
        title="Session title"
        isSessionActionPending
        onForkSession={onForkSession}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Session options' }))

    const menu = screen.getByRole('menu', { name: 'Session options' })
    const forkItem = within(menu).getByRole('menuitem', { name: 'Fork' })

    expect(forkItem).toHaveProperty('disabled', true)
    expect(onForkSession).not.toHaveBeenCalled()
  })
})
