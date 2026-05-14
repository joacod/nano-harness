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
              Advanced Mode
            </p>
            <p>The sidebar Advanced switch reveals only the advanced surfaces enabled here.</p>
          </div>

          <div className="settings-field-grid settings-field-grid-compact">
            <Switch
              type="button"
              checked={advanced.enabled}
              onClick={() => updateAdvanced({ ...advanced, enabled: !advanced.enabled })}
            >
              Enable advanced features
            </Switch>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="advanced-surfaces-heading">
          <div className="settings-section-heading">
            <p className="eyebrow" id="advanced-surfaces-heading">
              Advanced Surfaces
            </p>
            <p>Keep the default chat simple, and opt into detailed runtime surfaces when needed.</p>
          </div>

          <div className="settings-field-grid settings-field-grid-compact">
            <Switch
              type="button"
              checked={advanced.enabled && advanced.chatActivity}
              disabled={!advanced.enabled}
              onClick={() => updateAdvanced({ ...advanced, chatActivity: !advanced.chatActivity })}
            >
              Advanced chat activity
            </Switch>
            <Switch
              type="button"
              checked={advanced.enabled && advanced.telemetrySidebar}
              disabled={!advanced.enabled}
              onClick={() => updateAdvanced({ ...advanced, telemetrySidebar: !advanced.telemetrySidebar })}
            >
              Telemetry sidebar
            </Switch>
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
