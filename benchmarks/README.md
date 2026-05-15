# Nano Harness Benchmarks

These are small, tracked harness evaluation scenarios. They are not performance benchmarks; they are repeatable product regressions for agent behavior, safety, and evidence quality.

Generated outputs belong in ignored folders:
- `benchmarks/local/` for personal scenarios.
- `benchmarks/results/` for run results.
- `benchmarks/exports/` for exported evidence packets.

Use `create_benchmark_run_artifact` to turn tracked case outcomes into a benchmark result artifact. The action is non-mutating and returns a draft `benchmarks/results/<suite>.json` path that still requires approval before any file write.

## Tracked Cases

- `approval-pause-resume.md`: approval-gated action pause and resume behavior.
- `edit-and-test.md`: minimal edit plus validation evidence.
- `multi-turn-recall.md`: conversation context recall across turns.
- `recovery.md`: recoverable run behavior after interruption.
- `repo-survey.md`: read-only repository survey behavior.
- `spec-workbench.md`: create, plan, build, review, and export a local spec change.
- `validation-obligations.md`: create validation obligations after local edits and resolve them with evidence.
