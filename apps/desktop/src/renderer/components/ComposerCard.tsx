import { useState } from 'react'

import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { createConversationId, providerStatusQueryOptions } from '../queries'

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
    <section className="panel-card composer-card">
      <div className="sidebar-header-row">
        <h2>{conversationId ? 'Continue conversation' : 'First prompt'}</h2>
        {startRunMutation.isPending ? <span className="runtime-pill">Sending...</span> : null}
      </div>

      <form
        className="composer-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field
          name="prompt"
          children={(field) => (
            <textarea
              className="text-input composer-input"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Ask the local harness to summarize a file, explain a bug, or sketch a plan."
              rows={5}
            />
          )}
        />

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={startRunMutation.isPending}>
            Send prompt
          </button>
        </div>
      </form>

      {providerStatusQuery.data && !providerStatusQuery.data.isReady ? (
        <p className="warning-copy">
          Provider setup is incomplete. Update settings before expecting a successful hosted-provider response.
        </p>
      ) : null}
      {submitError ? <p className="error-copy">{submitError}</p> : null}
      {startRunMutation.error instanceof Error ? <p className="error-copy">{startRunMutation.error.message}</p> : null}
    </section>
  )
}
