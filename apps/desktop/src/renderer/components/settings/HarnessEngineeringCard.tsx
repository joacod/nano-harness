import { harnessComponentRegistry } from '../../../../../../packages/shared/src'
import { FeedbackText, StatusBadge } from '../ui'

export function HarnessEngineeringCard() {
  return (
    <div className="settings-tab-stack">
      <p className="eyebrow">Harness Engineering</p>
      <h2>Editable component registry</h2>
      <FeedbackText>
        Nano can inspect these versioned harness components and propose reversible, benchmark-gated changes. Promotion to live files remains approval-gated.
      </FeedbackText>
      <ol className="timeline-list" aria-label="Editable harness components">
        {harnessComponentRegistry.components.map((component) => (
          <li key={component.id} className="timeline-item">
            <div className="timeline-dot timeline-info" />
            <div className="timeline-card">
              <div className="timeline-header">
                <strong>{component.title}</strong>
                <StatusBadge status={component.mutable ? 'completed' : 'cancelled'}>{component.version}</StatusBadge>
              </div>
              <p className="timeline-type">{component.id} · {component.kind}</p>
              <small className="muted-copy">{component.path}</small>
            </div>
          </li>
        ))}
      </ol>
      <FeedbackText>
        Available workflow tools: list_harness_components, propose_harness_change, compare_benchmark_results.
      </FeedbackText>
    </div>
  )
}
