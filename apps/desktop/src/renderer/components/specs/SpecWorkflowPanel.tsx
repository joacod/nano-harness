import { useEffect, useMemo, useState } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import type { AgentRole, SpecChangeDetail } from '../../../../../../packages/shared/src'
import { createConversationId } from '../../queries'
import { Button, FeedbackText, StatusBadge } from '../ui'
import { SpecEvidencePanel } from './SpecEvidencePanel'

export function SpecWorkflowPanel({ change }: { change: SpecChangeDetail | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const buildableTasks = useMemo(() => {
    return change?.tasks.filter((task) => task.status !== 'done' && task.status !== 'blocked') ?? []
  }, [change])
  const startSpecRunMutation = useMutation({
    mutationFn: async (input: { role: AgentRole; taskIds?: string[]; workflowIntent: 'propose' | 'plan' | 'build' | 'verify' | 'archive' }) => {
      if (!change) {
        throw new Error('Select a spec change before starting a run.')
      }

      const conversationId = createConversationId()
      const result = await window.desktop.startSpecRun({
        conversationId,
        changeId: change.summary.id,
        role: input.role,
        taskIds: input.taskIds,
        workflowIntent: input.workflowIntent,
      })

      return { conversationId, runId: result.runId }
    },
    onSuccess: async ({ conversationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }),
        queryClient.invalidateQueries({ queryKey: ['spec-changes'] }),
      ])

      await navigate({
        to: '/conversations/$conversationId',
        params: { conversationId },
      })
    },
  })
  const selectedTask = buildableTasks.find((task) => task.id === selectedTaskId) ?? null

  useEffect(() => {
    if (!change || buildableTasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    setSelectedTaskId((currentTaskId) => {
      if (currentTaskId && buildableTasks.some((task) => task.id === currentTaskId)) {
        return currentTaskId
      }

      return buildableTasks[0]?.id ?? null
    })
  }, [buildableTasks, change])

  function startRoleRun(role: AgentRole, workflowIntent: 'propose' | 'plan' | 'build' | 'verify' | 'archive', taskIds?: string[]) {
    void startSpecRunMutation.mutateAsync({ role, workflowIntent, taskIds })
  }

  return (
    <section className="spec-workbench-column spec-workbench-workflow" aria-label="Spec workflow and evidence">
      <div className="spec-workbench-column-header">
        <p className="eyebrow">Workflow</p>
        <h2>Actions</h2>
      </div>
      {change ? (
        <div className="spec-workflow-summary">
          <strong>{change.summary.id}</strong>
          <StatusBadge status={change.summary.status}>{change.summary.status}</StatusBadge>
        </div>
      ) : null}
      {change && buildableTasks.length > 0 ? (
        <fieldset className="spec-task-picker" disabled={startSpecRunMutation.isPending}>
          <legend>Selected task</legend>
          <div className="spec-task-list">
            {buildableTasks.map((task) => (
              <label key={task.id} className="spec-task-choice">
                <input
                  type="radio"
                  name="spec-workbench-selected-task"
                  value={task.id}
                  checked={selectedTaskId === task.id}
                  onChange={() => setSelectedTaskId(task.id)}
                />
                <span>
                  <strong>{task.id}</strong>
                  {task.title}
                </span>
                <StatusBadge status={task.status}>{task.status}</StatusBadge>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="spec-workflow-actions">
        <Button
          type="button"
          fullWidth
          disabled={!change || startSpecRunMutation.isPending}
          onClick={() => startRoleRun('plan', 'propose')}
        >
          Propose
        </Button>
        <FeedbackText>Spec artifacts only; no application code edits.</FeedbackText>
        <Button
          type="button"
          fullWidth
          disabled={!change || startSpecRunMutation.isPending}
          onClick={() => startRoleRun('plan', 'plan')}
        >
          Plan
        </Button>
        <FeedbackText>Refine the approach, tasks, and validation plan.</FeedbackText>
        <Button
          type="button"
          fullWidth
          disabled={!change || !selectedTask || startSpecRunMutation.isPending}
          onClick={() => startRoleRun('build', 'build', selectedTask ? [selectedTask.id] : undefined)}
        >
          Build selected task
        </Button>
        <FeedbackText>Implement the selected task with focused changes.</FeedbackText>
        <Button
          type="button"
          fullWidth
          disabled={!change || startSpecRunMutation.isPending}
          onClick={() => startRoleRun('review', 'verify')}
        >
          Verify
        </Button>
        <FeedbackText>Review the spec, diff, validation output, and obligations.</FeedbackText>
        <Button
          type="button"
          fullWidth
          disabled={!change || change.summary.status === 'archived' || startSpecRunMutation.isPending}
          onClick={() => startRoleRun('review', 'archive')}
        >
          Archive
        </Button>
        <FeedbackText>Archive only when the evidence shows the change is ready.</FeedbackText>
      </div>
      {startSpecRunMutation.isPending ? <FeedbackText live>Starting spec run...</FeedbackText> : null}
      {startSpecRunMutation.error instanceof Error ? (
        <FeedbackText variant="error" live>{startSpecRunMutation.error.message}</FeedbackText>
      ) : null}
      <SpecEvidencePanel change={change} />
    </section>
  )
}
