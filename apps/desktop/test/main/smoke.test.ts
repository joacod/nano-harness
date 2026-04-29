import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import { buildProviderStatus } from '../../src/main/runtime'

describe('desktop main test foundation', () => {
  it('builds no provider status when settings are absent', async () => {
    const runtime = {
      store: {
        getProviderCredentialStatus: vi.fn(),
      },
    } as never

    await expect(buildProviderStatus(runtime, null)).resolves.toBeNull()
  })
})
