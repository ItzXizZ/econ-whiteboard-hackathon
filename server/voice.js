/**
 * Voice input through Argmax, on this machine.
 *
 * `voice-server/` is our own small Swift server built on Argmax's open-source
 * SDK (WhisperKit, on-device speech-to-text for Apple Silicon):
 *
 *     npm run voice                        ->  http://127.0.0.1:50060
 *
 * The browser records the question, converts it to a 16 kHz WAV and posts it
 * here; this module forwards it to that local server and returns the text.
 * Audio never leaves the computer. When the Argmax server is not running the
 * app simply hides the microphone and questions are typed.
 *
 *   ARGMAX_URL     where the Argmax server listens   (default http://127.0.0.1:50060)
 *   ARGMAX_MODEL   model name sent with each request (default tiny; the server
 *                  uses whichever model it was started with)
 *   ARGMAX=0       turn voice input off
 */

import express from 'express'

const ENABLED = process.env.ARGMAX !== '0'
export const ARGMAX_URL = (process.env.ARGMAX_URL || 'http://127.0.0.1:50060').replace(/\/+$/, '')
const ARGMAX_MODEL = process.env.ARGMAX_MODEL || 'tiny'
const TRANSCRIBE_TIMEOUT_MS = 60000

/** Words Whisper should expect, so "elasticity" is not heard as "electricity". */
const VOCAB_PROMPT =
  'An economics student asks a tutor about supply and demand, equilibrium price and quantity, elasticity, ' +
  'marginal cost, marginal revenue, surplus, shortage, deadweight loss, price ceiling, price floor, tax, subsidy, ' +
  'monopoly, GDP, inflation, aggregate demand, opportunity cost.'

let lastCheck = { at: 0, up: false }

/** True when the Argmax server answers at all (any HTTP status counts). */
export async function argmaxHealth({ maxAgeMs = 3000 } = {}) {
  if (!ENABLED) return false
  if (Date.now() - lastCheck.at < maxAgeMs) return lastCheck.up
  let up = false
  try {
    await fetch(`${ARGMAX_URL}/`, { signal: AbortSignal.timeout(1500) })
    up = true
  } catch {
    up = false
  }
  lastCheck = { at: Date.now(), up }
  return up
}

/** Whisper's markers for silence and noise are not words the student said. */
export function cleanTranscript(raw) {
  return String(raw || '')
    .replace(/\[[^\]]*\]|\([^)]*\)|<\|[^|]*\|>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function transcribeWav(buffer) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), 'question.wav')
  form.append('model', ARGMAX_MODEL)
  form.append('response_format', 'json')
  form.append('language', 'en')
  form.append('temperature', '0')
  form.append('prompt', VOCAB_PROMPT)
  const res = await fetch(`${ARGMAX_URL}/v1/audio/transcriptions`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`Argmax server answered ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  const body = await res.json()
  return cleanTranscript(body?.text)
}

export function registerVoiceRoutes(app) {
  app.get('/api/econ/voice/status', async (_req, res) => {
    const up = await argmaxHealth()
    res.json({ stt: up ? 'argmax' : 'off', enabled: ENABLED })
  })

  app.post(
    '/api/econ/transcribe',
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
        return res.status(400).json({ error: 'No audio received.' })
      }
      if (!(await argmaxHealth({ maxAgeMs: 0 }))) {
        return res.status(503).json({ error: 'The Argmax speech server is not running.' })
      }
      try {
        const text = await transcribeWav(req.body)
        res.json({ text })
      } catch (err) {
        console.warn('[voice] transcription failed:', err?.message)
        res.status(502).json({ error: 'Could not transcribe that. Please try again.' })
      }
    }
  )
}
