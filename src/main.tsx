import React from 'react'
import ReactDOM from 'react-dom/client'
import EconApp from './econ/EconApp'
import 'katex/dist/katex.min.css'
import './index.css'

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
