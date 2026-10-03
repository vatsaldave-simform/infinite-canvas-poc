import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadDocument } from '@core/persistence'
import App from './App.tsx'
import './index.css'

// Dev-only: `?indexeddb=off` boots as if this browser had no IndexedDB, to
// exercise the persisting-off path without changing browser settings.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('indexeddb') === 'off') {
  Object.defineProperty(window, 'indexedDB', { value: undefined })
}

// Started here, once per page load and outside any render, so StrictMode
// cannot run it twice. The tree suspends on it until the document arrives.
const loading = loadDocument()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App loading={loading} />
  </StrictMode>,
)
