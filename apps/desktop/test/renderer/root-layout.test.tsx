// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RootLayout } from '../../src/renderer/components/RootLayout'

const routerMocks = vi.hoisted(() => ({
  currentPath: '/',
  navigate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()

  return {
    ...actual,
    Outlet: () => <section>Route content</section>,
    useNavigate: () => routerMocks.navigate,
    useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
      select({ location: { pathname: routerMocks.currentPath } }),
  }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()

  return {
    ...actual,
    useQuery: () => ({ data: { isReady: true } }),
  }
})

vi.mock('../../src/renderer/runtime-ui', () => ({
  useRuntimeUi: () => ({
    context: null,
    recentEvents: [],
  }),
  useTechnicalUi: () => ({
    isSidebarCollapsed: false,
    showTechnicalInfo: false,
    toggleSidebarCollapsed: vi.fn(),
    toggleTechnicalInfo: vi.fn(),
  }),
}))

vi.mock('../../src/renderer/components/sidebar/ConversationNav', () => ({
  ConversationNav: () => <nav>Sessions</nav>,
}))

vi.mock('../../src/renderer/components/sidebar/RecentSignals', () => ({
  RecentSignals: () => null,
}))

vi.mock('../../src/renderer/components/sidebar/RuntimeSummary', () => ({
  RuntimeSummary: () => null,
}))

describe('RootLayout', () => {
  beforeEach(() => {
    routerMocks.currentPath = '/'
    routerMocks.navigate.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('toggles settings back to the previously active conversation', async () => {
    const user = userEvent.setup()
    routerMocks.currentPath = '/conversations/session-1'

    const { rerender } = render(<RootLayout />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(routerMocks.navigate).toHaveBeenLastCalledWith({ to: '/settings' })

    routerMocks.currentPath = '/settings'
    rerender(<RootLayout />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(routerMocks.navigate).toHaveBeenLastCalledWith({
      to: '/conversations/$conversationId',
      params: { conversationId: 'session-1' },
    })
  })

  it('toggles settings back to a new session', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<RootLayout />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(routerMocks.navigate).toHaveBeenLastCalledWith({ to: '/settings' })

    routerMocks.currentPath = '/settings'
    rerender(<RootLayout />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(routerMocks.navigate).toHaveBeenLastCalledWith({ to: '/' })
  })
})
