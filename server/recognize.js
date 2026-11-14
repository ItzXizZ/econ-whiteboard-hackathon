/**
 * Local handwriting recognition for the whiteboard (replaces a cloud service).
 *
 * The browser sends raw vector ink (per-stroke id + x/y arrays). Everything
 * else happens on this machine:
 *
 *   1. cluster strokes into text lines (vertical overlap, column splits;
 *      big strokes such as axes/curves of a graph are set aside as drawings)
 *   2. rasterise each line to a small, clean black-on-white PNG (sharp + SVG)
 *   3. transcribe each line with the local Bonsai vision model
 *   4. cache per line by a hash of its strokes, so only lines that actually
 *      changed are re-read (image prefill on CPU costs seconds per line)
 *
 * Response: { lines: [{ strokeIds, text }], drawings: [{ strokeIds }], pending }
 * ordered top-to-bottom. `text` is null for a line that has not been read yet
 * (model busy/unreachable); the client simply asks again later.
 */

import crypto from 'crypto'
import sharp from 'sharp'
import {
  bonsaiHealth,
  completeBackground,
  completeChat,
  imagePart,
  PRIORITY,
  SLOT,
} from './llm.js'

const MAX_STROKES = 1500
const MAX_POINTS_PER_STROKE = 4000
const MAX_LINES = 40

/** Raster geometry: ink is scaled to this height, then padded. ~2-3 vision patches tall. */
const INK_PX = Number(process.env.RECOGNIZE_INK_PX || 44)
const PAD_PX = 14
const MAX_LINE_WIDTH_PX = 896

const TRANSCRIBE_PROMPT =
  'This is one line of handwriting from a student solving an economics problem. ' +
  'Transcribe it exactly as plain text on one line. Use / for fractions and ^ for exponents. ' +
  'Output only the transcription, nothing else.'

// ── Stroke geometry ─────────────────────────────────────────────────────────

function cleanStrokes(raw) {
  const out = []
  const seen = new Set()
  for (const s of raw) {
    if (!s || !Array.isArray(s.x) || !Array.isArray(s.y)) continue
    const n = Math.min(s.x.length, s.y.length, MAX_POINTS_PER_STROKE)
    if (n === 0) continue
    const xs = []
    const ys = []
    for (let i = 0; i < n; i++) {
      const x = Number(s.x[i])
      const y = Number(s.y[i])
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x)
        ys.push(y)
      }
    }
    if (xs.length === 0) continue
    let id = typeof s.id === 'string' && s.id ? s.id.slice(0, 120) : `s${out.length}`
    while (seen.has(id)) id = `${id}_`
    seen.add(id)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < minX) minX = xs[i]
      if (xs[i] > maxX) maxX = xs[i]
      if (ys[i] < minY) minY = ys[i]
      if (ys[i] > maxY) maxY = ys[i]
    }
    out.push({ id, xs, ys, minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cy: (minY + maxY) / 2 })
  }
  return out
}

function median(values) {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function boundsOf(strokes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    if (s.minX < minX) minX = s.minX
    if (s.minY < minY) minY = s.minY
    if (s.maxX > maxX) maxX = s.maxX
    if (s.maxY > maxY) maxY = s.maxY
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/**
 * Group strokes into text lines. Returns { lines: Stroke[][], drawings: Stroke[] }.
 *
 * Heuristic, tuned for a few lines of equations/short phrases:
 *   - character height H = median height of "letter-like" strokes
 *   - strokes far taller/wider than text (axes, curves, boxes) are drawings
 *   - letter-sized strokes are chained into rows by vertical overlap
 *   - small marks (minus, equals bars, dots, superscripts) join the row whose
 *     vertical band contains them
 *   - a row with a big horizontal gap is split into separate lines (columns)
 */
export function clusterLines(strokes) {
  if (strokes.length === 0) return { lines: [], drawings: [] }

  const extents = strokes.map((s) => Math.max(s.w, s.h)).filter((e) => e > 4)
  const letterHeights = strokes.map((s) => s.h).filter((h) => h > 6)
  let H = median(letterHeights.length ? letterHeights : extents)
  if (!(H > 0)) H = 30
  // Tall outliers (a graph) can drag the median up when text is sparse; re-estimate
  // from strokes no taller than 2.5x the first guess.
  const refined = letterHeights.filter((h) => h <= H * 2.5)
  if (refined.length >= 3) H = Math.max(8, median(refined))

  const drawings = []
  const text = []
  for (const s of strokes) {
    if (s.h > H * 3.2 || s.w > H * 14) drawings.push(s)
    else text.push(s)
  }

  const big = text.filter((s) => s.h >= H * 0.45).sort((a, b) => a.minY - b.minY)
  const small = text.filter((s) => s.h < H * 0.45)

  /** rows: { strokes, top, bottom } built from letter-sized strokes */
  const rows = []
  for (const s of big) {
    let best = null
    let bestOverlap = 0
    for (const row of rows) {
      const overlap = Math.min(row.bottom, s.maxY) - Math.max(row.top, s.minY)
      const ratio = overlap / Math.max(1, Math.min(row.bottom - row.top, s.h))
      if (ratio > 0.4 && ratio > bestOverlap) {
        best = row
        bestOverlap = ratio
      }
    }
    if (best) {
      best.strokes.push(s)
      // Grow the band slowly so one tall stroke (a "Q" tail, a bracket) can't
      // swallow the line below.
      best.top = Math.min(best.top, s.minY)
      best.bottom = Math.max(best.bottom, Math.min(s.maxY, best.top + H * 2.2))
    } else {
      rows.push({ strokes: [s], top: s.minY, bottom: s.maxY })
    }
  }

  for (const s of small) {
    let best = null
    let bestDist = Infinity
    for (const row of rows) {
      const margin = H * 0.35
      const inside = s.cy >= row.top - margin && s.cy <= row.bottom + margin
      const dist = inside ? 0 : Math.min(Math.abs(s.cy - row.top), Math.abs(s.cy - row.bottom))
      // Among rows that contain it vertically prefer the horizontally nearest.
      const rb = boundsOf(row.strokes)
      const dx = s.maxX < rb.minX ? rb.minX - s.maxX : s.minX > rb.maxX ? s.minX - rb.maxX : 0
      const score = dist * 4 + dx
      if (dist <= H * 0.6 && dx <= H * 6 && score < bestDist) {
        best = row
        bestDist = score
      }
    }
    if (best) best.strokes.push(s)
    else rows.push({ strokes: [s], top: s.minY, bottom: s.maxY })
  }

  // Split rows at wide horizontal gaps (two columns of work, or a label beside a graph).
  const lines = []
  const gapLimit = Math.max(H * 3.5, 110)
  for (const row of rows) {
    const sorted = [...row.strokes].sort((a, b) => a.minX - b.minX)
    let current = [sorted[0]]
    let right = sorted[0].maxX
    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i]
      if (s.minX - right > gapLimit) {
        lines.push(current)
        current = [s]
        right = s.maxX
      } else {
        current.push(s)
        right = Math.max(right, s.maxX)
      }
    }
    lines.push(current)
  }

  // A "line" that is only one or two tiny marks is noise (a stray dot), not text.
  const kept = []
  for (const line of lines) {
    const b = boundsOf(line)
    if (Math.max(b.w, b.h) < Math.max(6, H * 0.25)) drawings.push(...line)
    else kept.push(line)
  }

  kept.sort((a, b) => {
    const ba = boundsOf(a)
    const bb = boundsOf(b)
    return ba.minY - bb.minY || ba.minX - bb.minX
  })
  return { lines: kept.slice(0, MAX_LINES), drawings }
}

// ── Rasterising ─────────────────────────────────────────────────────────────

/** Render strokes to a tight black-on-white PNG. Returns { png, width, height }. */
export async function rasterizeStrokes(strokes, { inkPx = INK_PX, maxWidth = MAX_LINE_WIDTH_PX } = {}) {
  const b = boundsOf(strokes)
  const inkH = Math.max(b.h, 8)
  let scale = inkPx / inkH
  // A single short mark ("-", "=") would otherwise be blown up enormously.
  scale = Math.min(scale, 3)
  if (b.w * scale > maxWidth - PAD_PX * 2) scale = (maxWidth - PAD_PX * 2) / b.w
  const width = Math.max(48, Math.ceil(b.w * scale + PAD_PX * 2))
  const height = Math.max(48, Math.ceil(inkH * scale + PAD_PX * 2))
  const offY = (height - inkH * scale) / 2
  const strokeW = Math.max(2, Math.min(4, (inkH * scale) / 15))
  const f = (v) => Math.round(v * 10) / 10

  let body = ''
  for (const s of strokes) {
    if (s.xs.length === 1 || (s.w < 1 && s.h < 1)) {
      body += `<circle cx="${f((s.xs[0] - b.minX) * scale + PAD_PX)}" cy="${f((s.ys[0] - b.minY) * scale + offY)}" r="${f(strokeW * 0.8)}" fill="#000"/>`
      continue
    }
    let pts = ''
    for (let i = 0; i < s.xs.length; i++) {
      pts += `${f((s.xs[i] - b.minX) * scale + PAD_PX)},${f((s.ys[i] - b.minY) * scale + offY)} `
    }
    body += `<polyline points="${pts.trim()}" fill="none" stroke="#000" stroke-width="${f(strokeW)}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return { png, width, height }
}

function lineHash(strokes) {
  const b = boundsOf(strokes)
  const h = crypto.createHash('sha1')
  for (const s of [...strokes].sort((a, c) => (a.id < c.id ? -1 : 1))) {
    h.update(s.id)
    h.update(':')
    // Position relative to the line, rounded: identical ink hashes identically
    // even if the client's coordinate origin shifts when other lines are added.
    for (let i = 0; i < s.xs.length; i++) {
      h.update(`${Math.round(s.xs[i] - b.minX)},${Math.round(s.ys[i] - b.minY)};`)
    }
    h.update('|')
  }
  return h.digest('hex')
}

// ── Transcription ───────────────────────────────────────────────────────────

/** Tidy raw model output into one plain-text line (or null when unusable). */
export function cleanTranscription(raw) {
  if (!raw) return null
  let t = String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ')
  t = t
    .replace(/^```[a-z]*|```$/gi, '')
    .replace(/^(?:transcription|text|output)\s*:\s*/i, '')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '')
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\times|\\cdot|×|·/g, ' x ')
    .replace(/\\div|÷/g, ' / ')
    .replace(/[−–—]/g, '-')
    .replace(/\\(?:text|mathrm|mathbf|mathit)\s*\{([^{}]*)\}/g, '$1')
    .replace(/_\{([^{}]*)\}/g, '$1')
    .replace(/_([A-Za-z0-9])/g, '$1')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || t.length > 120) return t ? t.slice(0, 120).trim() : null
  return t
}

/**
 * Read text out of an image with the local vision model.
 * `background` requests yield to interactive tutor replies and retry.
 */
export async function transcribeImage(dataUrl, { prompt = TRANSCRIBE_PROMPT, maxTokens = 48, background = true, signal } = {}) {
  const opts = {
    messages: [{ role: 'user', content: [imagePart(dataUrl), { type: 'text', text: prompt }] }],
    maxTokens,
    temperature: 0,
    slot: SLOT.vision,
    signal,
  }
  return background
    ? completeBackground(opts)
    : completeChat({ ...opts, priority: PRIORITY.interactive })
}

/** hash -> text (LRU). Survives across requests; cleared only on server restart. */
const lineCache = new Map()
const LINE_CACHE_MAX = 600
/** hash -> in-flight promise, shared by overlapping requests for the same ink. */
const lineJobs = new Map()

function cacheGet(hash) {
  if (!lineCache.has(hash)) return undefined
  const v = lineCache.get(hash)
  lineCache.delete(hash)
  lineCache.set(hash, v)
  return v
}

function cacheSet(hash, text) {
  lineCache.set(hash, text)
  if (lineCache.size > LINE_CACHE_MAX) lineCache.delete(lineCache.keys().next().value)
}

function transcribeLine(hash, strokes) {
  let job = lineJobs.get(hash)
  if (!job) {
    job = (async () => {
      const { png } = await rasterizeStrokes(strokes)
      const raw = await transcribeImage(`data:image/png;base64,${png.toString('base64')}`)
      const text = cleanTranscription(raw)
      // Cache even an unreadable line (as '') so a scribble is not re-read forever.
      cacheSet(hash, text ?? '')
      return text ?? ''
    })().finally(() => lineJobs.delete(hash))
    lineJobs.set(hash, job)
  }
  return job
}

/** Monotonic id of the newest recognize request; older ones stop starting new work. */
let latestRequest = 0

export function registerRecognizeRoutes(app, paths = ['/api/econ/recognize', '/api/math/recognize']) {
  const handler = async (req, res) => {
    const { strokes } = req.body || {}
    if (!Array.isArray(strokes) || strokes.length === 0) {
      return res.status(400).json({ error: 'No strokes to recognize.' })
    }
    if (strokes.length > MAX_STROKES) {
      return res.status(400).json({ error: 'Too many strokes for one recognition request.' })
    }
    const cleaned = cleanStrokes(strokes)
    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'No valid strokes to recognize.' })
    }

    const requestId = ++latestRequest
    let clientGone = false
    res.on('close', () => {
      if (!res.writableEnded) clientGone = true
    })

    try {
      const { lines, drawings } = clusterLines(cleaned)
      const entries = lines.map((ls) => ({ strokes: ls, hash: lineHash(ls), text: undefined }))
      for (const e of entries) e.text = cacheGet(e.hash)

      let pending = entries.some((e) => e.text === undefined)
      let modelDown = false
      if (pending) {
        if (!(await bonsaiHealth({ maxAgeMs: 4000 }))) {
          modelDown = true
        } else {
          for (const e of entries) {
            if (e.text !== undefined) continue
            // A newer request (more ink) supersedes this one: stop starting work.
            if (clientGone || requestId !== latestRequest) break
            try {
              e.text = await transcribeLine(e.hash, e.strokes)
            } catch (err) {
              // One unreadable line must not sink the rest of the board.
              console.warn('[recognize] line failed:', err?.name, err?.message)
              if (err?.name === 'BonsaiUnreachableError') {
                modelDown = true
                break
              }
            }
          }
        }
        pending = entries.some((e) => e.text === undefined)
      }

      if (clientGone) return
      res.json({
        lines: entries.map((e) => ({
          strokeIds: e.strokes.map((s) => s.id),
          text: e.text ? e.text : null,
        })),
        drawings: drawings.length ? [{ strokeIds: drawings.map((s) => s.id) }] : [],
        pending,
        model: modelDown ? 'unreachable' : 'ok',
      })
    } catch (err) {
      console.error('[recognize] request failed:', err?.message)
      if (!res.headersSent) res.status(500).json({ error: 'Recognition request failed.' })
    }
  }
  for (const p of paths) app.post(p, handler)
}
