// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkdownMessage } from '../../src/renderer/components/chat/MarkdownMessage'
import { createDesktopMock } from './test-utils'

describe('MarkdownMessage', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens safe links through the desktop bridge', async () => {
    const user = userEvent.setup()
    const openExternalUrl = vi.fn(async () => undefined)
    const openSpy = vi.fn()

    window.desktop = createDesktopMock({ openExternalUrl })
    vi.stubGlobal('open', openSpy)

    render(<MarkdownMessage content="[Open docs](https://example.com/docs)" />)

    await user.click(screen.getByRole('link', { name: 'Open docs' }))

    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith({ url: 'https://example.com/docs' })
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('falls back to window.open when the desktop bridge rejects the request', async () => {
    const user = userEvent.setup()
    const openExternalUrl = vi.fn(async () => {
      throw new Error('Failed to open')
    })
    const openSpy = vi.fn()

    window.desktop = createDesktopMock({ openExternalUrl })
    vi.stubGlobal('open', openSpy)

    render(<MarkdownMessage content="[Open docs](https://example.com/docs)" />)

    await user.click(screen.getByRole('link', { name: 'Open docs' }))

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener,noreferrer')
    })
  })

  it('does not route non-http links through the desktop bridge', async () => {
    const user = userEvent.setup()
    const openExternalUrl = vi.fn(async () => undefined)
    const openSpy = vi.fn()

    window.desktop = createDesktopMock({ openExternalUrl })
    vi.stubGlobal('open', openSpy)

    render(<MarkdownMessage content="[Email support](mailto:support@example.com)" />)

    const link = screen.getByRole('link', { name: 'Email support' })
    expect(link.getAttribute('href')).toBe('mailto:support@example.com')
    await user.click(link)

    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })
})
