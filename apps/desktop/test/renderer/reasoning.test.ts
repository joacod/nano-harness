import { describe, expect, it } from 'vitest'

import type { ReasoningDetail } from '@nano-harness/shared'

import {
  dedupeStrings,
  getReasoningDisplay,
  normalizeReasoningChunks,
  normalizeReasoningText,
} from '../../src/renderer/components/chat/reasoning'

describe('renderer reasoning utilities', () => {
  it('dedupes repeated and blank chunks using trimmed values', () => {
    expect(dedupeStrings(['', '  hello  ', 'hello', 'world', ' world '])).toEqual(['  hello  ', 'world'])
  })

  it('collapses short fragmented lines into readable prose', () => {
    expect(
      normalizeReasoningText(['Plan', 'Open file', 'Read file', 'Extract facts', 'Draft answer', 'Check result'].join('\n')),
    ).toBe('Plan Open file Read file Extract facts Draft answer Check result')
  })

  it('removes duplicate or very similar paragraphs', () => {
    const normalized = normalizeReasoningText([
      'I should inspect the file before answering.',
      '',
      'I should inspect the file before answering!',
      '',
      'Then summarize the result.',
    ].join('\n'))

    expect(normalized).toBe('I should inspect the file before answering.\n\nThen summarize the result.')
  })

  it('normalizes reasoning chunks and merges short chunk streams', () => {
    expect(normalizeReasoningChunks(['Plan', 'Open file', 'Open file', 'Summarize'])).toEqual([
      'Plan',
      'Open file',
      'Summarize',
    ])

    expect(normalizeReasoningChunks(['Plan', 'Read file', 'Extract', 'Summarize', 'Check', 'Answer'])).toEqual([
      'Plan Read file Extract Summarize Check Answer',
    ])
  })

  it('builds a reasoning display from text/details and counts encrypted blocks', () => {
    const details: ReasoningDetail[] = [
      { type: 'reasoning.summary', summary: 'Inspect workspace file.' },
      { type: 'reasoning.text', text: 'Read notes.txt first.' },
      { type: 'reasoning.encrypted', data: 'secret' },
      { type: 'reasoning.unknown', data: { raw: true } },
    ]

    expect(getReasoningDisplay('Inspect workspace file.', details)).toEqual({
      text: 'Inspect workspace file.\n\nRead notes.txt first.',
      summaries: [],
      encryptedCount: 2,
    })
  })

  it('returns null when no meaningful reasoning is available', () => {
    expect(getReasoningDisplay('', [])).toBeNull()
  })
})
