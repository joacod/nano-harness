import type { SkillInventory } from '../../../../../../packages/shared/src'
import { Card, FeedbackText, StatusBadge } from '../ui'

export function SkillsHubCard({ inventory }: { inventory: SkillInventory | null }) {
  const skills = inventory?.skills ?? []

  return (
    <Card>
      <p className="eyebrow">Skills</p>
      <h2>Skills hub</h2>
      <FeedbackText>
        Markdown skills are loaded from bundled defaults, `~/.nano/skills`, and `.nano/skills`. Full content is injected only when a skill matches the run.
      </FeedbackText>
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
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  )
}
