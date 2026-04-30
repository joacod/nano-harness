import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { FieldHint, LabeledField, TextField } from '../form-fields'
import { Button, FeedbackText, Select } from '../ui'

export function WorkspaceSettingsForm({
  initialSettings,
  isSaving,
  saveError,
  onSubmit,
}: {
  initialSettings: AppSettings
  isSaving: boolean
  saveError: string | null
  onSubmit: (settings: AppSettings) => Promise<void>
}) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      const normalizedSettings: AppSettings = {
        provider: {
          provider: value.provider.provider,
          model: value.provider.model.trim(),
          baseUrl: value.provider.baseUrl?.trim(),
          reasoning: value.provider.reasoning,
        },
        workspace: {
          ...value.workspace,
          rootPath: value.workspace.rootPath.trim(),
        },
      }

      await onSubmit(normalizedSettings)
      setSaveMessage('Workspace settings saved.')
    },
  })

  return (
    <>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setSaveMessage(null)
          void form.handleSubmit()
        }}
      >
        <LabeledField label="Workspace Root">
          <FieldHint>Built-in file actions are restricted to this directory tree.</FieldHint>
          <form.Field
            name="workspace.rootPath"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Workspace root is required.'),
            }}
            children={(field) => (
              <TextField field={field} name="workspace-root" placeholder="Example: /Users/name/project" autoComplete="off" spellCheck={false} />
            )}
          />
        </LabeledField>

        <LabeledField label="Approval Policy">
          <form.Field
            name="workspace.approvalPolicy"
            children={(field) => (
              <Select
                name="approval-policy"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as AppSettings['workspace']['approvalPolicy'])}
              >
                <option value="on-request">on-request</option>
                <option value="always">always</option>
                <option value="never">never</option>
              </Select>
            )}
          />
        </LabeledField>

        <div className="form-row">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save workspace settings'}
          </Button>
        </div>
      </form>

      {saveMessage ? (
        <FeedbackText variant="success" live>
          {saveMessage}
        </FeedbackText>
      ) : null}
      {saveError ? (
        <FeedbackText variant="error" live>
          {saveError}
        </FeedbackText>
      ) : null}
    </>
  )
}
