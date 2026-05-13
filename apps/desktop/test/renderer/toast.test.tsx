// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toast } from '../../src/renderer/components/ui'

describe('Toast', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a dismissible status message', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(
      <Toast
        autoDismissMs={0}
        toast={{ id: 'toast-1', title: 'Session exported', message: 'Saved session.json locally.' }}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain('Session exported')

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after the configured timeout', async () => {
    const onDismiss = vi.fn()

    render(
      <Toast
        autoDismissMs={1}
        toast={{ id: 'toast-1', title: 'Session exported' }}
        onDismiss={onDismiss}
      />,
    )

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })
})
