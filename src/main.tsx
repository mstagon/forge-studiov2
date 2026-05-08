import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'
// Initialize i18n side-effect import (registers resources + chosen language).
import './i18n'

// Browser/dev-only: when there's no Electron preload, install a stub so the
// app boots and routes can be tested with Playwright/chromium MCP. Real
// preload (production Forge.app) populates window.api first, so the stub
// becomes a no-op there.
if (import.meta.env.DEV) {
  // Top-level await is fine in Vite — this resolves before render.
  const { installDevApiStub } = await import('./devApiStub')
  installDevApiStub()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
