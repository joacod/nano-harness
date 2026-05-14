import { useEffect, useState } from 'react'

import type { AdvancedSettings, AppSettings } from '../../../../../../packages/shared/src'
import { createDefaultAdvancedSettings } from '../../../../../../packages/shared/src'
import { Button, FeedbackText, Switch } from '../ui'

type NormalizedAdvancedSettings = AppSettings & { advanced: AdvancedSettings }

export function AdvancedSettingsForm({
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
  const [savedSettings, setSavedSettings] = useState(() => normalizeAdvancedSettings(initialSettings))
  const [draftSettings, setDraftSettings] = useState(() => normalizeAdvancedSettings(initialSettings))
  const hasUnsavedChanges = serializeSettings(savedSettings) !== serializeSettings(normalizeAdvancedSettings(draftSettings))
  const advanced = normalizeAdvancedSettings(draftSettings).advanced

  function updateAdvanced(nextAdvanced: AdvancedSettings) {
    setDraftSettings((current) => ({
      ...current,
      advanced: nextAdvanced,
    }))
    setSaveMessage(null)
  }

  function toggleAllAdvanced() {
    if (advanced.enabled) {
      updateAdvanced({ ...advanced, enabled: false })
      return
    }

    updateAdvanced({
      enabled: true,
      chatActivity: true,
      telemetrySidebar: true,
    })
  }

  async function handleSubmit() {
    const normalizedSettings = normalizeAdvancedSettings(draftSettings)

    await onSubmit(normalizedSettings)
    setSavedSettings(normalizedSettings)
    setDraftSettings(normalizedSettings)
    setSaveMessage('Advanced settings saved.')
  }

  function handleCancel() {
    setDraftSettings(savedSettings)
    setSaveMessage(null)
  }

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
          void handleSubmit()
        }}
      >
        <section className="settings-section" aria-labelledby="advanced-mode-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="advanced-mode-heading">
              Advanced
            </p>
            <p>Keep the main workspace quiet by default, and turn on deeper run details when you need them.</p>
          </div>

          <div className="advanced-settings-list">
            <AdvancedSettingsRow
              title="Enable all"
              description="Turns on every advanced surface and shows the Advanced switch in the sidebar."
              checked={advanced.enabled}
              featured
              onToggle={toggleAllAdvanced}
            />
            <div className="advanced-settings-divider" aria-hidden="true" />
            <AdvancedSettingsRow
              title="Advanced chat activity"
              description="Show the transient run activity table before thinking or response streaming starts."
              checked={advanced.enabled && advanced.chatActivity}
              disabled={!advanced.enabled}
              onToggle={() => updateAdvanced({ ...advanced, chatActivity: !advanced.chatActivity })}
            />
            <AdvancedSettingsRow
              title="Telemetry sidebar"
              description="Show the right-side run list, event inspector, approvals, and evidence export controls."
              checked={advanced.enabled && advanced.telemetrySidebar}
              disabled={!advanced.enabled}
              onToggle={() => updateAdvanced({ ...advanced, telemetrySidebar: !advanced.telemetrySidebar })}
            />
          </div>
        </section>

        <div className="form-row action-row-left settings-save-row">
          <Button type="submit" variant="primary" disabled={isSaving || !hasUnsavedChanges}>
            {isSaving ? 'Saving…' : hasUnsavedChanges ? 'Save advanced settings' : 'Saved'}
          </Button>
          {hasUnsavedChanges ? (
            <Button type="button" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          ) : null}
          {hasUnsavedChanges ? <FeedbackText variant="warning">Unsaved advanced changes. Save to make them active.</FeedbackText> : null}
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

function AdvancedSettingsRow({
  checked,
  description,
  disabled,
  featured,
  onToggle,
  title,
}: {
  checked: boolean
  description: string
  disabled?: boolean
  featured?: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <div className={`advanced-settings-row${featured ? ' advanced-settings-row-featured' : ''}`}>
      <div className="advanced-settings-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Switch type="button" className="advanced-settings-switch" checked={checked} disabled={disabled} onClick={onToggle}>
        {checked ? 'On' : 'Off'}
      </Switch>
    </div>
  )
}

function normalizeAdvancedSettings(settings: AppSettings): NormalizedAdvancedSettings {
  return {
    ...settings,
    advanced: {
      ...createDefaultAdvancedSettings(),
      ...settings.advanced,
    },
  }
}

function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings)
}
