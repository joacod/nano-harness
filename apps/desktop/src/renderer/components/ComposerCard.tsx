import { useState } from 'react'

import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { createConversationId, providerStatusQueryOptions } from '../queries'
import { rendererFeatureFlags } from '../features'
import { Button, Card, FeedbackText, RuntimePill, TextArea } from './ui'
import { createSkillDraftPrompt, createSpecWorkflowPrompt, type AgentRole } from '../../../../../packages/shared/src'

type ComposerMode = AgentRole | 'spec'

const composerModes: Array<{ label: string; value: ComposerMode; description: string }> = [
  { label: 'Plan', value: 'plan', description: 'Explore and outline the approach before edits.' },
  { label: 'Build', value: 'build', description: 'Make focused implementation changes.' },
  { label: 'Review', value: 'review', description: 'Inspect code for bugs and risks.' },
  ...(rendererFeatureFlags.specs ? [{ label: 'Spec', value: 'spec' as const, description: 'Create a bounded Plan, Build, Review workflow spec.' }] : []),
]

export function ComposerCard({ conversationId }: { conversationId: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<ComposerMode>('build')
  const startRunMutation = useMutation({
    mutationFn: async (input: { prompt: string; role: AgentRole }) => {
      const nextConversationId = conversationId ?? createConversationId()
      const result = await window.desktop.startRun({
        conversationId: nextConversationId,
        prompt: input.prompt,
        role: input.role,
      })

      return {
        conversationId: nextConversationId,
        runId: result.runId,
      }
    },
    onSuccess: async ({ conversationId: nextConversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', nextConversationId] }),
      ])

      await navigate({
        to: '/conversations/$conversationId',
        params: { conversationId: nextConversationId },
      })
    },
  })

  const form = useForm({
    defaultValues: {
      prompt: '',
    },
    onSubmit: async ({ value }) => {
      const trimmedPrompt = value.prompt.trim()

      if (!trimmedPrompt) {
        setSubmitError('Enter a prompt before sending.')
        return
      }

      const runInput = buildRunInput(trimmedPrompt, selectedMode)

      setSubmitError(null)
      try {
        await startRunMutation.mutateAsync(runInput)
      } catch {
        return
      }

      form.reset()
    },
  })

  return (
    <Card className="composer-card">
      <div className="sidebar-header-row">
        {startRunMutation.isPending ? (
          <RuntimePill aria-live="polite">
            Sending…
          </RuntimePill>
        ) : null}
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <div className="composer-mode-group" role="group" aria-label="Run mode">
          {composerModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className="composer-mode-button"
              aria-pressed={selectedMode === mode.value}
              aria-label={`${mode.label} mode: ${mode.description}`}
              disabled={startRunMutation.isPending}
              onClick={() => setSelectedMode(mode.value)}
            >
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
        <div className="composer-input-row">
          <form.Field
            name="prompt"
            children={(field) => (
              <TextArea
                className="composer-input"
                aria-label="Prompt"
                name="prompt"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                    return
                  }

                  event.preventDefault()
                  void form.handleSubmit()
                }}
                placeholder="Describe the next task..."
                rows={3}
              />
            )}
          />
          <Button
            type="submit"
            variant="primary"
            className="composer-send-button"
            disabled={startRunMutation.isPending}
            aria-label="Send prompt"
          >
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
              <path d="M4 4l17 8-17 8 3-7 8-1-8-1-3-7z" />
            </svg>
          </Button>
        </div>
      </form>

      {providerStatusQuery.data && !providerStatusQuery.data.isReady ? (
        <FeedbackText variant="warning" live>
          Provider setup is incomplete. Update settings before expecting a successful hosted-provider response.
        </FeedbackText>
      ) : null}
      {submitError ? (
        <FeedbackText variant="error" live>
          {submitError}
        </FeedbackText>
      ) : null}
      {startRunMutation.error instanceof Error ? (
        <FeedbackText variant="error" live>
          {startRunMutation.error.message}
        </FeedbackText>
      ) : null}
    </Card>
  )
}

function buildRunInput(prompt: string, mode: ComposerMode): { prompt: string; role: AgentRole } {
  const skillDraftTask = parseNewSkillCommand(prompt)

  if (rendererFeatureFlags.skillDrafts && skillDraftTask) {
    return { prompt: createSkillDraftPrompt(skillDraftTask), role: 'plan' }
  }

  if (rendererFeatureFlags.specs && mode === 'spec') {
    return { prompt: createSpecWorkflowPrompt(prompt), role: 'plan' }
  }

  return { prompt, role: mode === 'spec' ? 'plan' : mode }
}

function parseNewSkillCommand(prompt: string): string | null {
  const match = /^\/new-skill(?:\s+(?<task>[\s\S]+))?$/u.exec(prompt.trim())
  const task = match?.groups?.task?.trim()

  return task ? task : null
}
