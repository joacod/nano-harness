import type { SkillInventory } from '../../../../../../packages/shared/src'
import { FeedbackText, StatusBadge, Switch } from '../ui'

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
        Markdown skills are loaded from bundled defaults, `~/.nano/skills`, and `.nano/skills`. Full content is injected only when an enabled skill matches the run.
      </FeedbackText>
      {error ? <FeedbackText variant="error" live>{error}</FeedbackText> : null}
      {skills.length === 0 ? <FeedbackText>No skills discovered.</FeedbackText> : null}
      {skills.length > 0 ? (
        <ol className="timeline-list" aria-label="Available skills">
          {skills.map((skill) => (
            <li key={skill.id} className="timeline-item">
              <div className="timeline-dot timeline-info" />
              <div className="timeline-card">
                <div className="timeline-header">
                  <strong>{skill.name}</strong>
                  <StatusBadge status={skill.enabled ? 'completed' : 'cancelled'}>{skill.enabled ? 'enabled' : 'disabled'}</StatusBadge>
                </div>
                <p className="timeline-type">{skill.source}{skill.path ? ` · ${skill.path}` : ''}</p>
                <FeedbackText>{skill.description}</FeedbackText>
                {skill.triggers.length ? <small className="muted-copy">Triggers: {skill.triggers.join(', ')}</small> : null}
                {skill.tools.length ? <small className="muted-copy">Tools: {skill.tools.join(', ')}</small> : null}
                <div className="run-controls">
                  <Switch
                    type="button"
                    checked={skill.enabled}
                    disabled={isSaving}
                    onClick={() => void onToggleSkill({ skillId: skill.id, enabled: !skill.enabled })}
                  >
                    {skill.enabled ? 'Disable skill' : 'Enable skill'}
                  </Switch>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
