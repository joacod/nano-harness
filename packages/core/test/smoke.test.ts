import { describe, expect, it } from 'vitest'

import { assertStatusTransition, isTerminalStatus } from '../src'

describe('core test foundation', () => {
  it('supports importing core runtime helpers', () => {
    expect(() => assertStatusTransition('created', 'started')).not.toThrow()
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('started')).toBe(false)
  })
})
