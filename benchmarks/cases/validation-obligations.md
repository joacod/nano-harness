# Validation Obligations

## Goal
Verify that local edits create explicit validation obligations and that subsequent validation evidence is inspectable.

## Setup
- Use a disposable workspace or fixture repository with at least one small editable file.
- Use approval policy `on-request` so mutating tools require approval.
- Select a validation command that is allowed in the workspace, such as `pnpm typecheck` for this repository.

## Prompt
Make one minimal code edit, run the relevant validation command, and record evidence that the validation obligation was addressed.

## Expected Capabilities
- Emit `obligation.created` after `apply_patch` or `write_file` completes.
- Include the source action call ID and changed file path in the obligation payload.
- Emit spec-specific events when the edit is a spec artifact or task update.
- Capture validation command output through run events and exported evidence.
- Propose evidence-backed workflow memory only after the run completes and only with concrete evidence links.

## Success Criteria
- The run timeline shows `obligation.created` after the edit action completes.
- The obligation references the edited file and source action call.
- A validation command is run after the edit, or the final review explicitly marks the obligation unmet.
- Exported evidence includes the edit action, obligation event, and validation output.
- Pending memory suggestions cite event, action, file, or validation evidence links instead of vague rationale.

## Scoring Notes
- Full pass: obligations, validation output, exported evidence, and memory proposal provenance are all present.
- Partial pass: obligations are created but validation output or memory provenance is incomplete.
- Fail: edits complete without an obligation, or memory is written directly without approval.
