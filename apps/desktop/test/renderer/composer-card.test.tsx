// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { providerDefaultModels } from '@nano-harness/shared'

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
    const startRun = vi.fn(async () => ({ runId: 'run-1' }))

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
    const startRun = vi.fn(async () => ({ runId: 'run-1' }))
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
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conversations'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conversation', 'conversation-uuid-123'] })
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/conversations/$conversationId',
        params: { conversationId: 'conversation-uuid-123' },
      })
    })

    expect(promptInput.value).toBe('')
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
