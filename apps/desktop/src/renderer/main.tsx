import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import './styles.css'
import 'streamdown/styles.css'

const queryClient = new QueryClient()

type ErrorBoundaryProps = {
  children: React.ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error(error)
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="workspace-shell workspace-shell-single">
        <section className="panel-card diagnostic-card">
          <p className="eyebrow">Renderer Diagnostic</p>
          <h2>Renderer crashed</h2>
          <p className="muted-copy">The React tree threw during render. The error is shown below so the screen never fails silently.</p>
          <pre className="message-pre error-copy">{this.state.error.stack ?? this.state.error.message}</pre>
        </section>
      </main>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
)
