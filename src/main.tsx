import React from 'react'
import ReactDOM from 'react-dom/client'
import EconApp from './econ/EconApp'
import 'katex/dist/katex.min.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: 'rgb(215,215,215)' }}
    >
      <EconApp />
    </div>
  </React.StrictMode>
)
