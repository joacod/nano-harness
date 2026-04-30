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
```

- `pnpm test` covers shared/core/infra packages plus desktop main, preload, and renderer behavior.
- `pnpm test:e2e` covers renderer smoke flows with a mocked desktop bridge.
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

## Workspace

- `apps/desktop`: Electron app shell and React renderer
- `packages/core`: orchestration runtime
- `packages/infra`: providers, persistence, and side effects
- `packages/shared`: shared contracts and schemas
