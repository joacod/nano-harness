// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { providerDefaultModels, type RunCreateInput } from '@nano-harness/shared'

import { ComposerCard } from '../../src/renderer/components/ComposerCard'
import { createDesktopMock, renderWithQueryClient } from './test-utils'

const navigateMock = vi.fn(async () => undefined)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()

  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('ComposerCard', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows a validation error for blank prompts and does not start a run', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })

    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus({ isReady: false, issues: ['Missing key'] }),
      startRun,
    })

    renderWithQueryClient(<ComposerCard conversationId={null} />)

    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    expect(startRun).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a prompt before sending.')).toBeTruthy()
    expect(screen.getByText('Provider setup is incomplete. Update settings before expecting a successful hosted-provider response.')).toBeTruthy()
  })

  it('trims prompts, starts a run, invalidates queries, and navigates to the conversation', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })

    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container, queryClient } = renderWithQueryClient(<ComposerCard conversationId={null} />)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.type(promptInput, '  ship tests  ')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith({
        conversationId: 'conversation-uuid-123',
        prompt: 'ship tests',
        role: 'build',
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conversations'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['sessions'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conversation', 'conversation-uuid-123'] })
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/conversations/$conversationId',
        params: { conversationId: 'conversation-uuid-123' },
      })
    })

    expect(promptInput.value).toBe('')
  })

  it('routes selected Plan mode to plan role runs', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })
    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container } = renderWithQueryClient(<ComposerCard conversationId={null} />)
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.click(screen.getByRole('button', { name: /Plan mode/u }))
    await user.type(promptInput, 'add MCP support')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith({
        conversationId: 'conversation-uuid-123',
        prompt: 'add MCP support',
        role: 'plan',
      })
    })
  })

  it('routes selected Review mode to review role runs', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })
    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container } = renderWithQueryClient(<ComposerCard conversationId={null} />)
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.click(screen.getByRole('button', { name: /Review mode/u }))
    await user.type(promptInput, 'check the auth changes')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith({
        conversationId: 'conversation-uuid-123',
        prompt: 'check the auth changes',
        role: 'review',
      })
    })
  })

  it('routes selected Spec mode through a durable workbench plan prompt', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })
    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container } = renderWithQueryClient(<ComposerCard conversationId={null} />)
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.click(screen.getByRole('button', { name: /Spec mode/u }))
    await user.type(promptInput, 'define session export')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith({
        conversationId: 'conversation-uuid-123',
        prompt: expect.stringContaining('define session export'),
        role: 'plan',
      })
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('Create a durable Spec Workbench change')
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('.nano/specs/changes/<changeId>/')
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('write_spec_artifact')
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('non-mutating and not durable')
    })
  })

  it('routes /new-skill commands through a non-mutating skill draft plan prompt', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async (input: RunCreateInput) => {
      void input
      return { runId: 'run-1' }
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' })
    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container } = renderWithQueryClient(<ComposerCard conversationId={null} />)
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.type(promptInput, '/new-skill release note writing')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith({
        conversationId: 'conversation-uuid-123',
        prompt: expect.stringContaining('release note writing'),
        role: 'plan',
      })
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('create_skill_improvement_artifact')
      expect(startRun.mock.calls[0]?.[0].prompt).toContain('Do not write skill files directly')
    })
  })

  it('surfaces start-run failures', async () => {
    const user = userEvent.setup()
    const startRun = vi.fn(async () => {
      throw new Error('Provider offline')
    })

    window.desktop = createDesktopMock({
      getProviderStatus: async () => createProviderStatus(),
      startRun,
    })

    const { container } = renderWithQueryClient(<ComposerCard conversationId="conversation-1" />)
    const promptInput = getRequiredElement<HTMLTextAreaElement>(container, 'textarea[name="prompt"]')

    await user.type(promptInput, 'try again')
    await user.click(screen.getByRole('button', { name: 'Send prompt' }))

    expect(await screen.findByText('Provider offline')).toBeTruthy()
  })
})

function createProviderStatus(overrides?: {
  providerId?: string
  providerLabel?: string
  model?: string
  baseUrl?: string
  apiKeyLabel?: string
  apiKeyPresent?: boolean
  isReady?: boolean
  issues?: string[]
  hints?: string[]
}) {
  return {
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    model: providerDefaultModels.openrouter,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API key',
    apiKeyPresent: true,
    isReady: true,
    issues: [],
    hints: [],
    ...overrides,
  }
}

function getRequiredElement<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing element for selector: ${selector}`)
  }

  return element
}
