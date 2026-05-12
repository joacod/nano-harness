# Nano Harness

`nano-harness` is a personal, local-first coding harness for working with AI providers under controlled autonomy. It gives you a desktop workspace where an assistant can plan, inspect code, make approved changes, run validation, and leave behind a clear trace of what happened.

Nano is intentionally small and opinionated. It is not a marketplace or a general agent platform; it is a local app for one owner who wants useful coding automation without losing visibility or control.

## What It Does

- Connects to configurable AI providers for streamed assistant runs.
- Lets the assistant inspect a workspace, search files, propose patches, and run approved commands.
- Keeps risky actions behind approvals and workspace boundaries.
- Shows an inspectable timeline of messages, tool calls, approvals, events, and validation output.
- Supports planning, building, reviewing, local skills, memory proposals, sessions, and evidence export.

## Why It Exists

- Local-first: your conversations, settings, approvals, and run evidence stay on your machine.
- Inspectable: the assistant's work is visible through events, approvals, and exports.
- Provider-flexible: use hosted or local providers through small adapters.
- Extensible: add capabilities through local tools, skills, settings, and spec-driven workflows.
- Personal: defaults and workflows are optimized for a single owner, not a large platform.

## Workspace

- `apps/desktop`: Electron main process, preload bridge, and React renderer.
- `packages/core`: orchestration runtime, run engine, policy, approvals, hooks, roles, and dry-run preview.
- `packages/infra`: provider adapters, SQLite persistence, built-in actions, skills loading, MCP adapters, and other side effects.
- `packages/shared`: shared Zod schemas, bridge contracts, settings, events, runs, memory, skills, MCP, and spec/harness artifacts.
- `benchmarks`: tracked regression scenarios for agent behavior, safety, and evidence quality.

## Development

Install dependencies:

```bash
pnpm install
```

Start the desktop app in development:

```bash
pnpm dev
```

Build everything:

```bash
pnpm build
```

## Testing

Run the main checks:

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm --filter @nano-harness/desktop check:styles
```

- `pnpm test` covers shared/core/infra packages plus desktop main, preload, and renderer behavior.
- `pnpm test:e2e` covers renderer smoke flows with a mocked desktop bridge.
- `pnpm --filter @nano-harness/desktop check:styles` guards renderer component CSS against raw design values and non-scalable sizing regressions.
- The Vite renderer alone does not include the Electron preload bridge, so browser-only checks and tests may mock `window.desktop`.

Note: run `pnpm exec playwright install chromium` on first-time setup or after Playwright upgrades.

## Packaging

Package the desktop app:

```bash
pnpm pack:mac
pnpm dist:mac
pnpm pack:win
pnpm dist:win
pnpm pack:linux
pnpm dist:linux
```

- `pnpm pack:mac` creates an unpacked app bundle for local verification.
- `pnpm dist:mac` creates a macOS disk image.
- `pnpm pack:win` and `pnpm dist:win` build Windows NSIS targets.
- `pnpm pack:linux` and `pnpm dist:linux` build Linux AppImage targets.
