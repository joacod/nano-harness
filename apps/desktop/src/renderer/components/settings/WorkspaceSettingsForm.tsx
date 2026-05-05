import { useEffect, useState } from 'react'

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
  const [savedSettings, setSavedSettings] = useState(() => normalizeWorkspaceSettings(initialSettings))
  const [draftSettings, setDraftSettings] = useState(() => normalizeWorkspaceSettings(initialSettings))
  const hasUnsavedChanges = serializeSettings(savedSettings) !== serializeSettings(normalizeWorkspaceSettings(draftSettings))
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
      setSavedSettings(normalizedSettings)
      setDraftSettings(normalizedSettings)
      setSaveMessage('Workspace settings saved.')
    },
  })

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

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
        <section className="settings-section" aria-labelledby="workspace-files-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="workspace-files-heading">
              File Access
            </p>
            <p>Directory available to built-in file actions.</p>
          </div>

          <div className="settings-field-grid settings-field-grid-wide">
            <div className="settings-field settings-field-wide">
              <LabeledField label="Workspace Root">
                <form.Field
                  name="workspace.rootPath"
                  validators={{
                    onChange: ({ value }) => (value.trim() ? undefined : 'Workspace root is required.'),
                  }}
                  children={(field) => (
                    <TextField
                      field={field}
                      name="workspace-root"
                      placeholder="Example: /Users/name/project"
                      autoComplete="off"
                      onValueChange={(value) => {
                        setDraftSettings((current) => ({
                          ...current,
                          workspace: { ...current.workspace, rootPath: value },
                        }))
                        setSaveMessage(null)
                      }}
                      spellCheck={false}
                    />
                  )}
                />
              </LabeledField>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="workspace-approvals-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="workspace-approvals-heading">
              Action Safety
            </p>
            <p>Approval behavior for tool actions.</p>
          </div>

          <div className="settings-field-grid settings-field-grid-compact">
            <div className="settings-field">
              <LabeledField label="Approval Policy">
                <FieldHint>on-request is the balanced default.</FieldHint>
                <form.Field
                  name="workspace.approvalPolicy"
                  children={(field) => (
                    <Select
                      name="approval-policy"
                      value={field.state.value}
                      onChange={(event) => {
                        const approvalPolicy = event.target.value as AppSettings['workspace']['approvalPolicy']
                        field.handleChange(approvalPolicy)
                        setDraftSettings((current) => ({
                          ...current,
                          workspace: { ...current.workspace, approvalPolicy },
                        }))
                        setSaveMessage(null)
                      }}
                    >
                      <option value="on-request">on-request</option>
                      <option value="always">always</option>
                      <option value="never">never</option>
                    </Select>
                  )}
                />
              </LabeledField>
            </div>
          </div>
        </section>

        <div className="form-row action-row-left settings-save-row">
          <Button type="submit" variant="primary" disabled={isSaving || !hasUnsavedChanges}>
            {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save workspace settings' : 'Saved'}
          </Button>
          {hasUnsavedChanges ? <FeedbackText variant="warning">Unsaved workspace changes. Save to make them active.</FeedbackText> : null}
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

function normalizeWorkspaceSettings(settings: AppSettings): AppSettings {
  return {
    provider: {
      provider: settings.provider.provider,
      model: settings.provider.model.trim(),
      baseUrl: settings.provider.baseUrl?.trim(),
      reasoning: settings.provider.reasoning,
    },
    workspace: {
      ...settings.workspace,
      rootPath: settings.workspace.rootPath.trim(),
    },
  }
}

function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings)
}
