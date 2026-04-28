import { useState } from 'react'

import { useForm } from '@tanstack/react-form'

import type { AppSettings } from '../../../../../../packages/shared/src'
import { providerOptions } from '../../../../../../packages/shared/src'
import { applyProviderDefaults } from '../../utils/run-events'
import { FieldHint, LabeledField, TextField } from '../form-fields'
import { Button, FeedbackText, Select } from '../ui'

export function ProviderSettingsForm({
  initialSettings,
  isSaving,
  saveError,
  onProviderChange,
  onSubmit,
}: {
  initialSettings: AppSettings
  isSaving: boolean
  saveError: string | null
  onProviderChange: (provider: AppSettings['provider']['provider']) => void
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
          reasoning: value.provider.reasoning,
        },
        workspace: {
          ...value.workspace,
          rootPath: value.workspace.rootPath.trim(),
        },
      }

      await onSubmit(normalizedSettings)
      setSaveMessage('Settings saved.')
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
        <LabeledField label="Provider">
          <FieldHint>Select the hosted provider you want to use.</FieldHint>
          <form.Field
            name="provider.provider"
            children={(field) => (
              <Select
                name="provider"
                value={field.state.value}
                onChange={(event) => {
                  const nextProvider = event.target.value as AppSettings['provider']['provider']
                  field.handleChange(nextProvider)
                  onProviderChange(nextProvider)
                  const nextSettings = applyProviderDefaults(form.state.values, nextProvider)
                  form.setFieldValue('provider.model', nextSettings.provider.model)
                }}
              >
                {providerOptions.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}
                  </option>
                ))}
              </Select>
            )}
          />
          <div className="preset-row">
            <Button
              type="button"
              onClick={() => {
                const providerKey = form.getFieldValue('provider.provider')
                const nextSettings = applyProviderDefaults(form.state.values, providerKey)
                form.setFieldValue('provider.model', nextSettings.provider.model)
              }}
            >
              Use defaults
            </Button>
          </div>
        </LabeledField>

        <LabeledField label="Model">
          <FieldHint>Choose a model available for your selected provider.</FieldHint>
          <form.Field
            name="provider.model"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : 'Model is required.'),
            }}
            children={(field) => (
              <TextField
                field={field}
                name="model"
                placeholder="Example: x-ai/grok-4.1-fast"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          />
        </LabeledField>

        <LabeledField label="Reasoning">
          <FieldHint>Show provider-supplied model thinking when the selected provider and model expose it. Effort modes may increase cost and latency.</FieldHint>
          <form.Field
            name="provider.reasoning"
            children={(field) => {
              const value = field.state.value?.mode === 'effort' ? field.state.value.effort : field.state.value?.mode ?? 'auto'

              return (
                <Select
                  name="provider-reasoning"
                  value={value}
                  onChange={(event) => {
                    const nextValue = event.target.value

                    if (nextValue === 'auto' || nextValue === 'off') {
                      field.handleChange({ mode: nextValue })
                      return
                    }

                    field.handleChange({ mode: 'effort', effort: nextValue as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' })
                  }}
                >
                  <option value="auto">auto</option>
                  <option value="off">off</option>
                  <option value="minimal">minimal effort</option>
                  <option value="low">low effort</option>
                  <option value="medium">medium effort</option>
                  <option value="high">high effort</option>
                  <option value="xhigh">xhigh effort</option>
                </Select>
              )
            }}
          />
        </LabeledField>

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
            {isSaving ? 'Saving…' : 'Save settings'}
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
