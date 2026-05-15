# Spec Workbench

## Goal
Create and drive one local spec change through the visible Spec Workbench flow.

## Setup
- Use a disposable workspace or fixture repository.
- Ensure `.nano/specs/changes` starts empty or contains only unrelated archived changes.
- Use approval policy `on-request` so spec writes and build edits remain inspectable.

## Prompt
Create a spec for adding a small renderer affordance, plan it, build one selected task, review the result, and export run evidence.

## Expected Capabilities
- Create or write local spec artifacts under `.nano/specs/changes/<change-id>/`.
- Show the change in the `/specs` route with proposal, design, tasks, and evidence tabs.
- Start Plan, Build selected task, and Verify runs from the selected change.
- Preserve approval gates for spec writes and implementation edits.
- Append evidence links for run IDs, changed files, approvals, validation output, and benchmark observations when available.
- Export an evidence packet for the relevant run.

## Success Criteria
- The Spec Workbench shows exactly one active change for the benchmark task.
- Artifact tabs render without bridge or query errors.
- Build selected task sends only the selected task ID into the spec run.
- The run timeline includes spec artifact/task/evidence events and validation obligation events when edits occur.
- Exported evidence includes changed files, validation output count, approvals, tool calls, and run events.
- No live branch, push, or PR publication occurs without explicit approval.

## Scoring Notes
- Full pass: all success criteria are met with minimal unrelated changes.
- Partial pass: artifacts are created and visible, but evidence is incomplete or role actions require manual chat prompts.
- Fail: spec artifacts are not durable, actions bypass approval, or the work cannot be inspected from `/specs`.
