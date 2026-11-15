import React from 'react'
import ReactDOM from 'react-dom/client'
import EconApp from './econ/EconApp'
import 'katex/dist/katex.min.css'
import './index.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
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
