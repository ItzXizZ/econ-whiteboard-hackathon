/**
 * Graph recognition for the whiteboard.
 *
 * A small image model trained on economics graphs (the "econ-graph-checker"
 * project: 41 graph types, right/wrong verdict, the kind of mistake and where
 * it is) runs as a local Python process next to this server. recognize.js
 * hands it a picture of each graph the student draws; the answer comes back as
 * a short description the tutor reads alongside the handwriting.
 *
 * The checker is optional. Without it (folder missing, Python missing, model
 * still loading) graphs are simply set aside as before and nothing breaks.
 *
 *   GRAPH_CHECKER_DIR     folder with train/model.pt   (default ~/econ-graph-checker)
 *   GRAPH_CHECKER_PYTHON  Python to run it with        (default: that folder's .venv)
 *   GRAPH_CHECKER=0       turn graph recognition off
 */

import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENABLED = process.env.GRAPH_CHECKER !== '0'
export const GRAPH_CHECKER_DIR = process.env.GRAPH_CHECKER_DIR || path.join(os.homedir(), 'econ-graph-checker')
const WORKER = path.join(__dirname, 'graph_worker.py')
const TMP_DIR = path.join(os.tmpdir(), 'econ-coach-graphs')
const REQUEST_TIMEOUT_MS = 20000
const START_TIMEOUT_MS = 90000
const RETRY_AFTER_MS = 30000

function findPython() {
  const candidates = [
    process.env.GRAPH_CHECKER_PYTHON,
    path.join(GRAPH_CHECKER_DIR, '.venv', 'bin', 'python'),
    path.join(GRAPH_CHECKER_DIR, '.venv', 'Scripts', 'python.exe'),
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

/** 'off' | 'missing' | 'starting' | 'ready' | 'failed' */
let state = ENABLED ? 'idle' : 'off'
let reason = ''
let child = null
let buffer = ''
let nextId = 1
let failedAt = 0
let readyWaiters = []
const pending = new Map()

function fail(why) {
  state = 'failed'
  reason = why
  failedAt = Date.now()
  for (const [, p] of pending) {
    clearTimeout(p.timer)
    p.reject(new Error(why))
  }
  pending.clear()
  for (const w of readyWaiters) w(false)
  readyWaiters = []
  if (child) {
    try {
      child.kill()
    } catch {}
    child = null
  }
}

function onLine(line) {
  if (!line.startsWith('{')) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.ready) {
    state = 'ready'
    reason = ''
    console.log('  Graph checker:   ready (graphs on the board are recognized)')
    for (const w of readyWaiters) w(true)
    readyWaiters = []
    return
  }
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  clearTimeout(p.timer)
  if (msg.error) p.reject(new Error(msg.error))
  else p.resolve(msg.result)
}

/** Start the worker if it is not running. Safe to call often. */
export function startGraphChecker() {
  if (state === 'off' || state === 'starting' || state === 'ready') return
  if (state === 'failed' && Date.now() - failedAt < RETRY_AFTER_MS) return
  if (!fs.existsSync(path.join(GRAPH_CHECKER_DIR, 'train', 'model.pt'))) {
    state = 'missing'
    reason = `no trained model at ${path.join(GRAPH_CHECKER_DIR, 'train', 'model.pt')}`
    return
  }
  const python = findPython()
  if (!python) {
    state = 'missing'
    reason = `no Python environment in ${path.join(GRAPH_CHECKER_DIR, '.venv')} (set GRAPH_CHECKER_PYTHON)`
    return
  }
  state = 'starting'
  reason = ''
  buffer = ''
  let stderrTail = ''
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true })
    child = spawn(python, ['-u', WORKER, GRAPH_CHECKER_DIR], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' },
    })
  } catch (err) {
    fail(`could not start the graph checker: ${err?.message}`)
    return
  }
  const startTimer = setTimeout(() => {
    if (state === 'starting') fail('the graph checker took too long to load')
  }, START_TIMEOUT_MS)
  startTimer.unref?.()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      onLine(buffer.slice(0, nl).trim())
      buffer = buffer.slice(nl + 1)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-600)
  })
  child.on('error', (err) => fail(`graph checker error: ${err?.message}`))
  child.on('exit', (code) => {
    clearTimeout(startTimer)
    if (state === 'off') return
    const last = stderrTail.trim().split('\n').pop() || ''
    const why = `graph checker stopped (exit ${code})${last ? `: ${last}` : ''}`
    if (state !== 'failed') {
      console.warn(`  Graph checker:   ${why}`)
      fail(why)
    }
  })
  child.stdin.on('error', () => {})
}

export function graphCheckerStatus() {
  if (state === 'idle') startGraphChecker()
  return { state: state === 'idle' ? 'starting' : state, reason, dir: GRAPH_CHECKER_DIR }
}

/** Resolves true once the model is loaded (false if it cannot be). */
export function graphCheckerReady(timeoutMs = 0) {
  startGraphChecker()
  if (state === 'ready') return Promise.resolve(true)
  if (state !== 'starting' || timeoutMs <= 0) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    readyWaiters.push((ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
  })
}

const title = (s) => String(s || '').replace(/_/g, ' ')

/** Friendly names for the graph types whose raw label reads badly. */
const TYPE_NAMES = {
  ad_as_long_run: 'AD-AS (long run)',
  ad_as_output_gap: 'AD-AS with an output gap',
  fx_market: 'foreign exchange market',
  is_lm: 'IS-LM',
  monopolistic_competition_lr: 'monopolistic competition (long run)',
  pc_firm_loss: 'perfectly competitive firm making a loss',
  pc_firm_profit: 'perfectly competitive firm making a profit',
  pc_long_run: 'perfect competition in the long run',
  ppf: 'production possibilities frontier (PPF)',
  ppf_shift: 'production possibilities frontier (PPF)',
  supply_demand_equilibrium: 'supply and demand',
}

/**
 * How sure the checker must be before anything is said.
 *
 * Measured on pen-stroke drawings from this whiteboard: a normal supply and
 * demand sketch is identified with 0.93 to 0.99 confidence, while a wrongly
 * drawn one tends to be mistaken for another graph type at 0.4 to 0.7. So a
 * low type confidence means "do not name it", and the checker saying "correct"
 * is not treated as proof: only a confident mistake is reported as a verdict.
 */
const TYPE_MIN = Number(process.env.GRAPH_TYPE_MIN || 0.9)
const WRONG_MIN = Number(process.env.GRAPH_WRONG_MIN || 0.8)

/**
 * Turn the model's raw output into what the app uses.
 * status: 'recognized' (type known, no mistake flagged) | 'mistake' | 'unknown'
 */
export function describeGraph(raw) {
  if (!raw || typeof raw !== 'object') return null
  const typeConf = Number(raw.graph_type_conf) || 0
  const pWrong = Number(raw.p_incorrect) || 0
  const known = typeConf >= TYPE_MIN
  const name = known ? TYPE_NAMES[raw.graph_type] || title(raw.graph_type) : ''
  let status = 'unknown'
  if (known) status = pWrong >= WRONG_MIN && raw.error_type && raw.error_type !== 'none' ? 'mistake' : 'recognized'
  const out = {
    status,
    type: known ? raw.graph_type : null,
    name,
    typeConfidence: Math.round(typeConf * 100) / 100,
    mistakeChance: Math.round(pWrong * 100) / 100,
  }
  if (status === 'mistake') {
    out.mistake = title(raw.error_type)
    if (raw.explanation) out.explanation = String(raw.explanation).slice(0, 300)
    if (raw.fix) out.fix = String(raw.fix).slice(0, 200)
    if (Array.isArray(raw.error_bbox) && raw.error_bbox.length === 4) out.errorBox = raw.error_bbox.map(Number)
  }
  return out
}

/** One transcript line for the tutor. Starts with "Graph" so prompts can refer to it. */
export function graphTranscriptLine(g) {
  if (!g) return ''
  if (g.status === 'unknown') return 'Graph: the student drew a graph here (the graph checker could not tell which kind).'
  if (g.status === 'recognized' && g.checked) {
    return `Graph of ${g.name}. Measured: demand slopes down, supply slopes up, and the labels are on the right curves.`
  }
  if (g.status === 'recognized') return `Graph of ${g.name}. The graph checker flagged no mistakes.`
  if (g.source === 'measured') {
    return `Graph of ${g.name}. It has a mistake: ${g.mistake}. Fix: ${g.fix}`.slice(0, 240)
  }
  const fix = g.fix ? ` Fix: ${g.fix}` : ''
  return `Graph of ${g.name}. The graph checker flagged a likely mistake: ${g.mistake}.${fix}`.slice(0, 230)
}

/** hash -> described result */
const cache = new Map()
const CACHE_MAX = 200

export function cachedGraph(hash) {
  return cache.get(hash)
}

/**
 * Check one graph image (PNG buffer). Returns the described result, or null
 * when the checker is not available right now. Never throws.
 */
export async function checkGraphImage(hash, png) {
  if (cache.has(hash)) return cache.get(hash)
  startGraphChecker()
  if (state !== 'ready') return null
  const file = path.join(TMP_DIR, `${hash}.png`)
  try {
    await fs.promises.writeFile(file, png)
    const id = nextId++
    const raw = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('graph check timed out'))
      }, REQUEST_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, path: file })}\n`)
    })
    const described = describeGraph(raw)
    if (described) {
      cache.set(hash, described)
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
    }
    return described
  } catch (err) {
    console.warn('[graph] check failed:', err?.message)
    return null
  } finally {
    fs.promises.unlink(file).catch(() => {})
  }
}

export function stopGraphChecker() {
  const c = child
  state = 'off'
  child = null
  if (c) {
    try {
      c.kill()
    } catch {}
  }
}
