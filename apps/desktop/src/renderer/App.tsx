export function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Repo Foundation</p>
        <h1>nano-harness</h1>
        <p className="lede">
          Electron, Vite, React, and the initial workspace boundaries are in place.
        </p>
        <dl className="meta-grid">
          <div>
            <dt>Shell</dt>
            <dd>Electron desktop app</dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>React + Vite</dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>core, infra, shared</dd>
          </div>
          <div>
            <dt>Bridge</dt>
            <dd>{window.desktop.platform}</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
