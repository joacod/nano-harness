import { benchmarkCaseRegistry, harnessComponentRegistry } from '../../../../../../packages/shared/src'
import { FeedbackText, StatusBadge } from '../ui'

export function HarnessEngineeringCard() {
  return (
    <div className="settings-tab-stack">
      <p className="eyebrow">Harness Engineering</p>
      <h2>Editable component registry</h2>
      <FeedbackText>
        Nano can inspect these versioned harness components and propose reversible, benchmark-gated changes. Promotion to live files remains approval-gated.
      </FeedbackText>
      <section className="settings-section" aria-labelledby="harness-loop-heading">
        <div className="settings-section-heading">
          <p className="eyebrow" id="harness-loop-heading">Promotion Loop</p>
          <p>Evidence must move through diagnosis, manifest, patch preview, before/after benchmarks, comparison, promotion artifact, and explicit approval.</p>
        </div>
        <ol className="settings-card-list" aria-label="Harness promotion loop">
          {['Evidence source', 'Diagnosis', 'Harness change manifest', 'Isolated patch preview', 'Before benchmark', 'After benchmark', 'Benchmark comparison', 'Promotion artifact', 'Explicit approval', 'Archived evidence'].map((step) => (
            <li key={step} className="settings-card-item">
              <div className="timeline-card">
                <strong>{step}</strong>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <ol className="settings-card-list" aria-label="Editable harness components">
        {harnessComponentRegistry.components.map((component) => (
          <li key={component.id} className="settings-card-item">
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
      <h3>Tracked benchmark cases</h3>
      <ol className="settings-card-list" aria-label="Tracked benchmark cases">
        {benchmarkCaseRegistry.cases.map((benchmarkCase) => (
          <li key={benchmarkCase.id} className="settings-card-item">
            <div className="timeline-card">
              <div className="timeline-header">
                <strong>{benchmarkCase.title}</strong>
                <StatusBadge status="completed">tracked</StatusBadge>
              </div>
              <p className="timeline-type">{benchmarkCase.id}</p>
              <small className="muted-copy">{benchmarkCase.path}</small>
            </div>
          </li>
        ))}
      </ol>
      <FeedbackText>
        Available workflow tools: list_harness_components, propose_harness_change, create_harness_patch_preview_artifact, list_benchmark_results, create_benchmark_run_plan, create_benchmark_run_artifact, write_benchmark_run_artifact, compare_benchmark_results, create_harness_promotion_artifact, write_harness_promotion_artifact, list_harness_promotion_artifacts, read_harness_promotion_artifact.
      </FeedbackText>
      <FeedbackText>
        Spec capstone tools: create_spec_artifact and create_draft_pr_artifact. Use Spec mode in the composer to enter Plan mode with a bounded implementation spec request.
      </FeedbackText>
    </div>
  )
}
