/**
 * Econ Coach API server (port 3002 by default).
 *
 * Everything is local: accounts and boards are JSON files under server/data/,
 * and all AI (hints, handwriting recognition, problem OCR) runs on a Bonsai-2
 * model served by llama.cpp on 127.0.0.1. This process makes no outbound
 * network requests other than to that local model server.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { registerAccountRoutes } from './server/accounts.js'
import { registerRecognizeRoutes } from './server/recognize.js'
import { registerTutorRoutes, warmTutorCaches } from './server/math.js'
import { BONSAI_URL, bonsaiHealth, bonsaiModelName } from './server/llm.js'
import { graphCheckerStatus, startGraphChecker, stopGraphChecker } from './server/graphCheck.js'
import { ARGMAX_URL, argmaxHealth, registerVoiceRoutes } from './server/voice.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3002)
const HOST = process.env.HOST || '127.0.0.1'

const app = express()
app.disable('x-powered-by')
app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }))
app.use(express.json({ limit: '30mb' }))

app.get('/api/health', async (_req, res) => {
  const reachable = await bonsaiHealth()
  res.json({
    ok: true,
    app: 'econ-coach',
    storage: 'local-json',
    bonsai: {
      reachable,
      url: BONSAI_URL,
      model: reachable ? await bonsaiModelName() : null,
    },
    graphChecker: graphCheckerStatus(),
    stt: (await argmaxHealth()) ? 'argmax' : 'off',
    tts: 'browser-speechSynthesis',
    cloud: false,
  })
})

registerAccountRoutes(app)
registerRecognizeRoutes(app)
registerVoiceRoutes(app)
registerTutorRoutes(app)

// Unknown API routes are JSON 404s (never the SPA shell).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Production: serve the built client from dist/.
const dist = path.join(__dirname, 'dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Malformed JSON / oversized bodies -> JSON errors instead of HTML stack traces.
app.use((err, _req, res, _next) => {
  const status = err?.status || err?.statusCode || 500
  if (status >= 500) console.error('[server]', err?.message)
  res.status(status).json({
    error:
      status === 413
        ? 'Request too large.'
        : status === 400
          ? 'Malformed request.'
          : 'Server error, please try again.',
  })
})

app.listen(PORT, HOST, async () => {
  console.log(`\n  Econ Coach API   http://${HOST}:${PORT}`)
  console.log('  Accounts/boards: local JSON files in server/data/')
  startGraphChecker()
  const gc = graphCheckerStatus()
  if (gc.state === 'starting') console.log(`  Graph checker:   loading from ${gc.dir}`)
  else if (gc.state === 'off') console.log('  Graph checker:   off (GRAPH_CHECKER=0)')
  else console.log(`  Graph checker:   not available, ${gc.reason}. Graphs will be set aside.`)
  if (await argmaxHealth()) console.log(`  Argmax speech:   reachable at ${ARGMAX_URL} (microphone is on)`)
  else console.log(`  Argmax speech:   not running at ${ARGMAX_URL}. Questions are typed until it starts.`)
  const up = await bonsaiHealth()
  if (up) {
    console.log(`  Bonsai model:    reachable at ${BONSAI_URL} (${(await bonsaiModelName()) ?? 'unknown'})`)
    warmTutorCaches()
  } else {
    console.log(`  Bonsai model:    NOT reachable at ${BONSAI_URL}`)
    console.log('                   start it in another terminal:  npm run bonsai')
    // Keep checking quietly so caches warm up as soon as the model appears.
    const timer = setInterval(async () => {
      if (await bonsaiHealth()) {
        clearInterval(timer)
        console.log('  Bonsai model:    now reachable, warming prompt caches')
        warmTutorCaches()
      }
    }, 5000)
    timer.unref?.()
  }
  console.log('')
})

// Take the graph checker process down with the server.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopGraphChecker()
    process.exit(0)
  })
}
process.on('exit', stopGraphChecker)
