import { useState } from 'react'

import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { createConversationId, providerStatusQueryOptions } from '../queries'
import { Button, Card, FeedbackText, RuntimePill, TextArea } from './ui'

export function ComposerCard({ conversationId }: { conversationId: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const providerStatusQuery = useQuery(providerStatusQueryOptions)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const startRunMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const nextConversationId = conversationId ?? createConversationId()
      const result = await window.desktop.startRun({
        conversationId: nextConversationId,
        prompt,
      })

      return {
        conversationId: nextConversationId,
        runId: result.runId,
      }
    },
    onSuccess: async ({ conversationId: nextConversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
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
      const prompt = value.prompt.trim()

      if (!prompt) {
        setSubmitError('Enter a prompt before sending.')
        return
      }

      setSubmitError(null)
      await startRunMutation.mutateAsync(prompt)
      form.reset()
    },
  })

  return (
    <Card className="composer-card">
      <div className="sidebar-header-row">
        <h2>Command input</h2>
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
        <div className="composer-input-row">
          <form.Field
            name="prompt"
            children={(field) => (
              <TextArea
                className="composer-input"
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
                placeholder="Enter an instruction for the local harness…"
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
