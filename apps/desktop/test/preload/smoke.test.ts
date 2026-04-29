import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const on = vi.fn()
const off = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    off,
  },
}))

describe('desktop preload test foundation', () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear()
    invoke.mockReset()
    on.mockReset()
    off.mockReset()
    vi.resetModules()
  })

  it('exposes the desktop API in the preload script', async () => {
    await import('../../src/preload/index')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
    expect(exposeInMainWorld).toHaveBeenCalledWith('desktop', expect.any(Object))
  })
})
