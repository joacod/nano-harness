import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatRelativeTimestamp, previewText } from '../../src/renderer/utils/formatting'

describe('renderer formatting utilities', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes and truncates preview text', () => {
    expect(previewText('   hello   world   ')).toBe('hello world')
    expect(previewText('    ')).toBe('No additional detail.')
    expect(previewText('abcdefghij', 5)).toBe('abcd…')
  })

  it('formats relative timestamps across minute, hour, and day ranges', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'))

    expect(formatRelativeTimestamp('2026-04-29T12:00:00.000Z')).toBe('just now')
    expect(formatRelativeTimestamp('2026-04-29T11:58:00.000Z')).toBe('2m ago')
    expect(formatRelativeTimestamp('2026-04-29T10:00:00.000Z')).toBe('2h ago')
    expect(formatRelativeTimestamp('2026-04-27T12:00:00.000Z')).toBe('2d ago')
  })
})
