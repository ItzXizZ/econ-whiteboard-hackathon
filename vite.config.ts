import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // The local API server (server.js) listens on 3002 by default.
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
    },
  },
})
