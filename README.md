# Nano Harness

`nano-harness` is a local-first desktop app for experimenting with agent runs, provider streaming, events, and tool execution in a small inspectable workspace.

## Development

Install dependencies:

```bash
pnpm install
```

Start the desktop app in development:

```bash
pnpm dev
```

Package the desktop app:

```bash
pnpm pack:mac
pnpm dist:mac
pnpm pack:win
pnpm dist:win
pnpm pack:linux
pnpm dist:linux
```

- `pnpm pack:mac` creates an unpacked app bundle for local verification at `apps/desktop/dist/mac-arm64/Nano Harness.app`.
- `pnpm dist:mac` creates a macOS disk image at `apps/desktop/dist/Nano Harness-<version>-arm64.dmg`.
- `pnpm pack:win` and `pnpm dist:win` build Windows NSIS targets.
- `pnpm pack:linux` and `pnpm dist:linux` build Linux AppImage targets.

Build everything:

```bash
pnpm build
```

## Testing

```bash
pnpm test         # vitest unit + integration tests
pnpm test:e2e     # playwright smoke tests
pnpm typecheck    # workspace typecheck
pnpm lint         # lint check
```

- `pnpm test` covers shared contracts, core orchestration, infra providers/persistence/actions, desktop main/preload boundaries, and renderer utilities.
- `pnpm test:e2e` covers renderer boot, starting a run with streamed output, and approval flow interaction using a mocked desktop bridge.

Note: run `pnpm exec playwright install chromium` on first-time setup or after Playwright upgrades.

Recommended verification flow after changes:

```bash
pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build
```

## Workspace

- `apps/desktop`: Electron app shell and React renderer
- `packages/core`: orchestration runtime
- `packages/infra`: providers, persistence, and side effects
- `packages/shared`: shared contracts and schemas
