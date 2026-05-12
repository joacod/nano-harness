# Nano Harness

## Product Direction
- Nano is a personal, local-first coding harness with controlled autonomy. Preserve the small, opinionated, inspectable desktop-app experience rather than turning it into a broad agent platform or marketplace.
- Prefer simple settings toggles, local files, commands, and harness capabilities over complex UI surfaces. Advanced workflows should remain understandable through run events, approvals, evidence exports, and local artifacts.
- `docs/` is intentionally ignored and may contain local roadmap-completion notes. Do not rely on it for committed product behavior unless the user explicitly asks to promote something from docs into tracked code or README content.

## Structure
- This is a pnpm workspace: `apps/*` and `packages/*` are the only package roots.
- `apps/desktop` is the Electron app. Main process boot/runtime lives in `src/main/`; preload bridge lives in `src/preload/`; renderer lives in `src/renderer/`.
- Add desktop bridge APIs in both `apps/desktop/src/preload/index.ts` and `packages/shared/src/bridge/`.
- The renderer uses TanStack Router, TanStack Query, TanStack Form, and Streamdown. Extend those patterns instead of adding alternatives.
- For renderer UI changes, preserve desktop accessibility conventions: visible `:focus-visible` states for interactive controls, `aria-live="polite"` for async feedback, meaningful form `name`/`autocomplete` metadata, `Intl`-based formatting helpers, and CSS overflow handling for long model names, paths, tool IDs, and event details.
- Renderer CSS is layered through `apps/desktop/src/renderer/styles/index.css`; keep raw design values in `styles/tokens/`, prefer semantic/component tokens in component CSS, use `rem` for scalable sizes, and reserve `px` for hairlines, breakpoints, shadows, and crisp decorative geometry. Run `pnpm --filter @nano-harness/desktop check:styles` after renderer style changes.
- `packages/shared` owns Zod schemas and cross-process contracts. Change shared contracts first, then update main/preload/renderer callers.
- `packages/core` owns orchestration. `CoreRunEngine` coordinates focused runtime seams in `provider-turn-runner.ts`, `action-invocation-pipeline.ts`, `approval-gate.ts`, and `dry-run-preview-builder.ts`; supporting contracts live in `provider.ts`, `actions.ts`, `policy.ts`, `event-bus.ts`, `approvals.ts`, `hooks.ts`, and `run-status.ts`. `packages/infra` owns side effects: providers, built-in actions, MCP adapters, skills loading, and SQLite persistence.

## Workflow
- Use `pnpm install` with `pnpm@10.33.2`.
- Main checks are `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- This project is pre-release. Do not add migrations, backward-compatible schema fallbacks, or compatibility shims unless explicitly requested. Prefer updating the current schema/contracts directly; local data can be recreated from scratch until the project is declared released.
- For renderer/UI work, run `pnpm dev` and inspect `http://localhost:5173/` with Playwright if needed.
- The Vite renderer does not expose the Electron preload bridge. For browser-only verification or renderer tests, mock `window.desktop` when bridge behavior matters.
- When using Playwright against the Vite renderer, inject the `window.desktop` mock with `page.addInitScript()` before navigation or reload, then open the sidebar if it is collapsed. Otherwise the app intentionally renders the desktop bridge diagnostic instead of the real UI.
- Renderer tests use `jsdom` and `@testing-library/react`; both `*.test.ts` and `*.test.tsx` are used under `apps/desktop/test/renderer/`.

## Runtime Details
- Settings default to provider `openrouter` with model `x-ai/grok-4.1-fast` (`packages/shared/src/settings.ts`). The provider implementation is OpenAI-compatible SSE streaming in `packages/infra/src/openai-compatible-provider.ts`.
- Tool calling uses native OpenAI-compatible chat completions ordering: assistant messages may include `toolCalls`, and executed tool results are persisted as `role: "tool"` messages with matching `toolCallId`. Update shared contracts, persistence, core orchestration, and provider mapping together when changing this flow.
- The SQLite store initializes itself on startup via `createSqliteStore()`. In the desktop app, the DB lives under `app.getPath('userData')/data/nano-harness.db`; the default agent workspace root is `~/nano-harness`. Message metadata for tool calls/results is serialized in `messages.metadata` via `packages/infra/src/sqlite/message-metadata.ts`, so message schema changes usually require matching store updates.
- Built-in actions are `list_directory`, `read_file`, `read_range`, `glob`, `grep`, `apply_patch`, `write_file`, `fetch_url`, `run_command`, `git_status`, `git_diff`, `list_harness_components`, `propose_harness_change`, `compare_benchmark_results`, `create_spec_artifact`, and `create_draft_pr_artifact`. The registry is `packages/infra/src/built-in-actions.ts`, and implementations live under `packages/infra/src/actions/`. Mutating or risky actions such as `apply_patch`, `write_file`, `run_command`, and `propose_harness_change` require approval; with approval policy `never`, required-approval actions are denied instead of auto-running.
- Tool-facing workspace paths are relative and use `/` separators on every OS, including Windows. Keep boundary/path normalization centralized in `packages/core/src/workspace-paths.ts`, and use `pathToFileURL()` instead of manual `file://` strings for local file URLs.
- Plan, Build, and Review roles are first-class run roles. `/plan`, `/build`, `/review`, and `/spec` are parsed in the renderer; `/spec` routes into Plan mode and produces a bounded spec workflow prompt.
- Skills are Markdown data packages resolved by `MarkdownSkillResolver`; the target shape is the standard Agent Skills folder model with `SKILL.md` plus optional `scripts/`, `references/`, and `assets/`. MCP inventory and resources are filtered through configured registry contracts before exposure.
- Sessions are first-class lineage records layered over conversations. Transcripts remain conversation-owned; session fork/clone/export operations preserve lineage metadata and exported evidence.
- Safety checks are centralized in `packages/core/src/policy.ts`, with workspace boundaries, command classification, personal rules, and `pre_tool_use`/`post_tool_use` hook events. Preserve hook event fidelity in timeline/export changes.
- Approved memory records and pending memory proposals live in SQLite. Approved records are recalled into provider instructions with provenance; proposal approval writes `USER.md`/`MEMORY.md` under the app data directory.
- Harness engineering and spec workflow tools are non-mutating by default. Change manifests, benchmark comparisons, specs, draft PR artifacts, and evidence packets can be generated locally, but live harness mutation, branch mutation, remote push, and PR publication must remain approval-gated.
- Inspectability is a product feature, not debug-only plumbing: the renderer exposes live and persisted run events, run history, and approval state, so preserve event fidelity when changing runtime behavior.
