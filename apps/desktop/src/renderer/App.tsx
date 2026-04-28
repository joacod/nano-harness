import { Card, FeedbackText } from './components/ui'
import { RuntimeUiProvider } from './runtime-ui'

export function App() {
  if (typeof window === 'undefined' || !('desktop' in window) || !window.desktop) {
    return (
      <main className="workspace-shell workspace-shell-single">
        <Card className="diagnostic-card">
          <p className="eyebrow">Renderer Diagnostic</p>
          <h2>Desktop bridge unavailable</h2>
          <FeedbackText>
            The renderer loaded, but `window.desktop` was not exposed by preload. In a normal Electron run this means the preload script failed to load.
          </FeedbackText>
          <FeedbackText variant="error">
            If you opened `http://localhost:5173/` in a browser tab directly, this screen is expected because the preload bridge only exists inside Electron.
          </FeedbackText>
        </Card>
      </main>
    )
  }

  return <RuntimeUiProvider />
}
