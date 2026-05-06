import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { toFileDatabaseUrl } from '../src/sqlite/paths'

describe('sqlite path helpers', () => {
  it('builds database file URLs with platform-aware URL encoding', () => {
    const databasePath = '/tmp/Nano Harness/nano-harness.db'

    expect(toFileDatabaseUrl(databasePath)).toBe(pathToFileURL(databasePath).toString())
    expect(toFileDatabaseUrl(databasePath)).toContain('Nano%20Harness')
  })
})
