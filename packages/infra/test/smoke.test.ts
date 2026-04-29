import { describe, expect, it } from 'vitest'

import { resolveSqliteStorePaths } from '../src'

describe('infra test foundation', () => {
  it('resolves sqlite store paths from a data directory', () => {
    const paths = resolveSqliteStorePaths({
      dataDir: '/tmp/nano-harness-tests',
    })

    expect(paths.dataDir).toBe('/tmp/nano-harness-tests')
    expect(paths.databaseFilePath).toContain('nano-harness.db')
    expect(paths.databaseUrl).toContain('file:')
  })
})
