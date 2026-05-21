# TODO

## Deferred Features

These features are still in the codebase, but hidden by default through `apps/desktop/src/renderer/features.ts` so the app can stay focused on the basic chat workflow for now.

- Spec Workbench routes and sidebar entry.
- Spec composer mode.
- Spec artifact, task, evidence, and workflow panels.
- Spec timeline links from the run inspector.
- Harness self-improvement settings, promotion loop, benchmark workflow, and editable component registry UI.
- Skills settings and `/new-skill` drafting shortcut.
- MCP settings.
- Memory settings and run-level memory inspector surfaces.
- Session fork, clone, and export actions.
- Session compaction UI.

## Right Sidebar Refactor

Recommended direction: keep the right sidebar as a compact advanced summary during chat, then move heavy run data into a full page opened from a selected run.

- Add a full Run Details page for selected run history, event timeline, approvals, evidence export, memory proposals, and validation obligations.
- Keep the right sidebar small: recent runs, selected run status, pending approval summary, and an Open Details action.
- Move long timelines, memory proposal review, validation details, and evidence details out of the sidebar to avoid nested scrolling problems.
- Revisit whether separate pages are needed later for Run History, Memory, Evidence, and Specs if those features are re-enabled.
