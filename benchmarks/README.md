# Nano Harness Benchmarks

These are small, tracked harness evaluation scenarios. They are not performance benchmarks; they are repeatable product regressions for agent behavior, safety, and evidence quality.

Generated outputs belong in ignored folders:
- `benchmarks/local/` for personal scenarios.
- `benchmarks/results/` for run results.
- `benchmarks/exports/` for exported evidence packets.

Use `create_benchmark_run_plan` to turn tracked case markdown into a repeatable suite plan. After running the cases, use `create_benchmark_run_artifact` to turn case outcomes into a benchmark result artifact. The artifact action is non-mutating and returns a draft `benchmarks/results/<suite>.json` path. Use approval-gated `write_benchmark_run_artifact` to validate and persist that artifact under `benchmarks/results/`. Use `list_benchmark_results` to inspect persisted result summaries before comparing or promoting harness changes.

The desktop bridge can start a benchmark suite with `startBenchmarkSuite({ suite, caseIds })`. It starts one Build run per selected tracked case using the case markdown as the run prompt. It does not score or write results automatically; review the run evidence, then create and write a benchmark result artifact through the approval-gated artifact flow above.

## Tracked Cases

- `approval-pause-resume.md`: approval-gated action pause and resume behavior.
- `edit-and-test.md`: minimal edit plus validation evidence.
- `multi-turn-recall.md`: conversation context recall across turns.
- `recovery.md`: recoverable run behavior after interruption.
- `repo-survey.md`: read-only repository survey behavior.
- `spec-workbench.md`: create, plan, build, review, and export a local spec change.
- `validation-obligations.md`: create validation obligations after local edits and resolve them with evidence.
