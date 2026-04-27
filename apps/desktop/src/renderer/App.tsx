import { RuntimeUiProvider } from './runtime-ui'

export function App() {
  if (typeof window === 'undefined' || !('desktop' in window) || !window.desktop) {
    return (
      <main className="workspace-shell workspace-shell-single">
        <section className="panel-card diagnostic-card">
          <p className="eyebrow">Renderer Diagnostic</p>
          <h2>Desktop bridge unavailable</h2>
          <p className="muted-copy">
            The renderer loaded, but `window.desktop` was not exposed by preload. In a normal Electron run this means the preload script failed to load.
          </p>
          <p className="error-copy">
            If you opened `http://localhost:5173/` in a browser tab directly, this screen is expected because the preload bridge only exists inside Electron.
          </p>
        </section>
      </main>
    )
  }

  return <RuntimeUiProvider />
}
