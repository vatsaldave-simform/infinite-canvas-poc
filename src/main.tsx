import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadDocument } from '@core/persistence'
import App from './App.tsx'
import './index.css'

// Started here, once per page load and outside any render, so StrictMode
// cannot run it twice. The tree suspends on it until the document arrives.
const loading = loadDocument()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App loading={loading} />
  </StrictMode>,
)
