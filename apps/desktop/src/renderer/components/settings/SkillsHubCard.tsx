import type { SkillInventory } from '../../../../../../packages/shared/src'
import { FeedbackText, Switch } from '../ui'

export function SkillsHubCard({
  inventory,
  isSaving,
  error,
  onToggleSkill,
}: {
  inventory: SkillInventory | null
  isSaving: boolean
  error: string | null
  onToggleSkill: (input: { skillId: string; enabled: boolean }) => Promise<void>
}) {
  const skills = inventory?.skills ?? []

  return (
    <div className="settings-tab-stack">
      <p className="eyebrow">Skills</p>
      <h2>Skills hub</h2>
      <FeedbackText>
        Markdown skills are loaded from bundled defaults, `~/.nano/skills`, and `.nano/skills`. Enabled skills are available automatically on every run. Use `/new-skill &lt;task&gt;` in chat to draft a project-local skill proposal, then approve the write action to save it.
      </FeedbackText>
      {error ? <FeedbackText variant="error" live>{error}</FeedbackText> : null}
      {skills.length === 0 ? <FeedbackText>No skills discovered.</FeedbackText> : null}
      {skills.length > 0 ? (
        <ol className="settings-card-list" aria-label="Available skills">
          {skills.map((skill) => (
            <li key={skill.id} className="settings-card-item">
              <div className="timeline-card">
                <div className="timeline-header">
                  <strong>{skill.name}</strong>
                  <Switch
                    type="button"
                    className="skill-status-switch"
                    checked={skill.enabled}
                    disabled={isSaving}
                    onClick={() => void onToggleSkill({ skillId: skill.id, enabled: !skill.enabled })}
                  >
                    {skill.enabled ? 'enabled' : 'disabled'}
                  </Switch>
                </div>
                <p className="timeline-type">{skill.source}{skill.path ? ` · ${skill.path}` : ''}</p>
                <FeedbackText>{skill.description}</FeedbackText>
                {skill.validationWarnings.length ? (
                  <FeedbackText variant="warning" live>
                    Validation warnings: {skill.validationWarnings.join(' ')}
                  </FeedbackText>
                ) : null}
                {skill.triggers.length ? <small className="muted-copy">Focus terms: {skill.triggers.join(', ')}</small> : null}
                {skill.tools.length ? <small className="muted-copy">Tools: {skill.tools.join(', ')}</small> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
