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
