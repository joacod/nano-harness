// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Select } from '../../src/renderer/components/ui'

describe('Select', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the menu outside the card so it can open downward when viewport space allows', async () => {
    const user = userEvent.setup()
    const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(this: Element) {
      if (this.classList.contains('custom-select')) {
        return createRect({ top: 420, bottom: 462 })
      }

      return createRect({ top: 0, bottom: 0 })
    })

    render(
      <section className="panel-card">
        <Select name="approval-policy" value="on-request" onChange={() => undefined}>
          <option value="on-request">on-request</option>
          <option value="always">always</option>
          <option value="never">never</option>
        </Select>
      </section>,
    )

    await user.click(screen.getByRole('button', { name: 'on-request' }))

    expect(rectSpy).toHaveBeenCalled()
    expect(screen.getByRole('listbox').parentElement).toBe(document.body)
    expect(screen.getByRole('listbox').getAttribute('style')).toContain('top: 468px')
  })
})

function createRect({ top, bottom }: { top: number; bottom: number }): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom,
    width: 100,
    height: bottom - top,
    left: 0,
    right: 100,
    toJSON: () => ({}),
  }
}
