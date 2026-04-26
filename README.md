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

Run checks:

```bash
pnpm typecheck
pnpm lint
```

## Workspace

- `apps/desktop`: Electron app shell and React renderer
- `packages/core`: orchestration runtime
- `packages/infra`: providers, persistence, and side effects
- `packages/shared`: shared contracts and schemas
