/**
 * Thin client for the LOCAL Bonsai-2 model served by llama.cpp's llama-server
 * (OpenAI-compatible API on localhost). No cloud calls anywhere.
 *
 * Start the model with:  npm run bonsai
 *
 * CPU inference means one request at a time is all the machine can do well, so
 * every call goes through a tiny priority scheduler:
 *   - priority 0  interactive tutor replies (hints, questions)
 *   - priority 1  background work (handwriting recognition, problem OCR, warm-up)
 * A waiting interactive request preempts a running background job (the job is
 * aborted and its caller retries later), so a hint never queues behind OCR.
 */

export const BONSAI_URL = (process.env.BONSAI_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '')

/**
 * llama-server keeps one prompt cache per slot. Pinning each kind of request
 * to its own slot keeps that kind's (static) system prompt cached, which is
 * the single biggest latency win on CPU. The default launcher starts 4 slots.
 */
export const SLOT = { hint: 0, chat: 1, long: 2, vision: 3 }
const SLOT_COUNT = Number(process.env.BONSAI_SLOTS || 4)

export const PRIORITY = { interactive: 0, background: 1 }

export class PreemptedError extends Error {
  constructor() {
    super('preempted by an interactive request')
    this.name = 'PreemptedError'
  }
}

export class BonsaiUnreachableError extends Error {
  constructor(detail) {
    super(
      'The local Bonsai model is not running. Start it in another terminal with "npm run bonsai" and try again.' +
        (detail ? ` (${detail})` : '')
    )
    this.name = 'BonsaiUnreachableError'
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────

const waiting = [] // { priority, resolve }
let running = null // { priority, preempt?: () => void }

function pump() {
  if (running || waiting.length === 0) return
  waiting.sort((a, b) => a.priority - b.priority)
  const next = waiting.shift()
  running = { priority: next.priority, preempt: null }
  next.resolve(running)
}

function acquire(priority) {
  return new Promise((resolve) => {
    waiting.push({ priority, resolve })
    // An interactive request never waits behind background work.
    if (running && priority < running.priority) running.preempt?.()
    pump()
  })
}

function release(ticket) {
  if (running === ticket) running = null
  pump()
}

/** True while an interactive request is running or queued (background jobs back off). */
export function interactiveBusy() {
  return (
    (running && running.priority === PRIORITY.interactive) ||
    waiting.some((w) => w.priority === PRIORITY.interactive)
  )
}

// ── Health ──────────────────────────────────────────────────────────────────

let lastHealth = { ok: false, at: 0 }

export async function bonsaiHealth({ maxAgeMs = 0 } = {}) {
  if (maxAgeMs && Date.now() - lastHealth.at < maxAgeMs) return lastHealth.ok
  let ok = false
  try {
    const r = await fetch(`${BONSAI_URL}/health`, { signal: AbortSignal.timeout(2500) })
    ok = r.ok
  } catch {
    ok = false
  }
  lastHealth = { ok, at: Date.now() }
  return ok
}

/** Model id reported by llama-server (for /api/health and the README check). */
export async function bonsaiModelName() {
  try {
    const r = await fetch(`${BONSAI_URL}/v1/models`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return null
    const j = await r.json()
    const id = j?.data?.[0]?.id || j?.models?.[0]?.name || null
    return id ? String(id).split(/[\\/]/).pop() : null
  } catch {
    return null
  }
}

// ── Chat completions ────────────────────────────────────────────────────────

/** OpenAI-style image part from a data URL. */
export function imagePart(dataUrl) {
  return { type: 'image_url', image_url: { url: dataUrl } }
}

/**
 * Stream a chat completion from Bonsai.
 *
 * opts:
 *   messages     OpenAI-format messages (images as image_url data URLs)
 *   maxTokens    hard cap on generated tokens
 *   temperature  default 0.4
 *   slot         llama-server slot to pin (see SLOT)
 *   priority     PRIORITY.interactive | PRIORITY.background
 *   stop         optional stop strings
 *   onText       called with each text delta; return false to stop early
 *   signal       caller's AbortSignal (e.g. client disconnected)
 *
 * Resolves with { text, finishReason, timings }.
 * Throws PreemptedError (background only), BonsaiUnreachableError, or Error.
 */
export async function streamChat({
  messages,
  maxTokens = 200,
  temperature = 0.4,
  slot,
  priority = PRIORITY.interactive,
  stop,
  onText,
  signal,
}) {
  const ticket = await acquire(priority)
  const controller = new AbortController()
  let preempted = false
  let stoppedEarly = false
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  if (priority > PRIORITY.interactive) {
    ticket.preempt = () => {
      preempted = true
      controller.abort()
    }
    // An interactive request may have queued between acquire() and here.
    if (interactiveBusy()) ticket.preempt()
  }

  let full = ''
  let finishReason = null
  let timings = null
  try {
    if (controller.signal.aborted) {
      if (preempted) throw new PreemptedError()
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    }
    let res
    try {
      res = await fetch(`${BONSAI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages,
          max_tokens: maxTokens,
          temperature,
          top_p: 0.85,
          top_k: 20,
          // The launcher's small-model defaults add a presence penalty of 1.5,
          // which makes a tutor avoid repeating the student's own symbols.
          presence_penalty: 0,
          repeat_penalty: 1.05,
          stream: true,
          // llama.cpp extras (ignored by other OpenAI-compatible servers)
          cache_prompt: true,
          timings_per_token: true,
          chat_template_kwargs: { enable_thinking: false },
          ...(Number.isInteger(slot) && slot < SLOT_COUNT ? { id_slot: slot } : {}),
          ...(stop?.length ? { stop } : {}),
        }),
      })
    } catch (err) {
      if (controller.signal.aborted) throw err
      lastHealth = { ok: false, at: Date.now() }
      throw new BonsaiUnreachableError(err?.cause?.code || err?.message)
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Bonsai server error ${res.status}: ${detail.slice(0, 200)}`)
    }
    lastHealth = { ok: true, at: Date.now() }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    outer: for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let json
        try {
          json = JSON.parse(payload)
        } catch {
          continue // partial JSON line
        }
        if (json.error) throw new Error(json.error.message || 'Bonsai stream error')
        if (json.timings) timings = json.timings
        const choice = json.choices?.[0]
        const delta = choice?.delta?.content
        if (delta) {
          full += delta
          if (onText?.(delta) === false) {
            stoppedEarly = true
            controller.abort()
            break outer
          }
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason
      }
    }
    return { text: full, finishReason: stoppedEarly ? 'stop' : finishReason, timings }
  } catch (err) {
    if (stoppedEarly) return { text: full, finishReason: 'stop', timings }
    if (preempted) throw new PreemptedError()
    throw err
  } finally {
    signal?.removeEventListener?.('abort', onAbort)
    release(ticket)
  }
}

/** Non-streaming convenience wrapper: resolves with the full text. */
export async function completeChat(opts) {
  const { text } = await streamChat({ ...opts, onText: undefined })
  return text
}

/**
 * Background completion that survives preemption: if an interactive request
 * bumps it, wait for the tutor to go quiet and try again.
 */
export async function completeBackground(opts, { retries = 6 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await completeChat({ ...opts, priority: PRIORITY.background })
    } catch (err) {
      if (!(err instanceof PreemptedError) || attempt >= retries) throw err
      if (opts.signal?.aborted) throw err
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}
