// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { previewText } from '../../src/renderer/utils/formatting'

describe('desktop renderer test foundation', () => {
  it('runs renderer-targeted tests in a browser-like environment', () => {
    expect(document).toBeDefined()
    expect(previewText('  hello   world  ')).toBe('hello world')
  })
})
