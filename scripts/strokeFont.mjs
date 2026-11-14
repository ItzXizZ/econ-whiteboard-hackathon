/**
 * A tiny hand-drawn "stroke font" used to synthesise handwriting for tests:
 * each glyph is one or more pen strokes (polylines), jittered so no two
 * renderings are identical. Used by scripts/smoke.mjs (API tests) and to
 * replay pen input in a real browser.
 *
 * Glyph space: x to the right, y down; y = 0 is cap height, y = 1 the baseline.
 */

/** Deterministic PRNG so test runs are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rad = (deg) => (deg * Math.PI) / 180

/** Elliptical arc from angle a0 to a1 (degrees, 0 = right, 90 = down). */
function arc(cx, cy, rx, ry, a0, a1, n = 14) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n)
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return pts
}

/** glyph -> { w: advance width, strokes: [[ [x,y], ... ], ...] } */
const GLYPHS = {
  0: { w: 0.62, strokes: [arc(0.3, 0.5, 0.26, 0.5, -90, 275, 20)] },
  1: { w: 0.42, strokes: [[[0.06, 0.24], [0.26, 0], [0.26, 1]]] },
  2: { w: 0.66, strokes: [[...arc(0.3, 0.27, 0.25, 0.27, 190, 395, 12), [0.04, 1], [0.6, 1]]] },
  3: { w: 0.62, strokes: [[...arc(0.26, 0.25, 0.25, 0.25, -150, 90, 10), ...arc(0.26, 0.75, 0.29, 0.25, -90, 150, 10)]] },
  4: { w: 0.68, strokes: [[[0.4, 0], [0.03, 0.66], [0.62, 0.66]], [[0.44, 0.3], [0.44, 1]]] },
  5: { w: 0.64, strokes: [[[0.52, 0], [0.12, 0], [0.08, 0.42], ...arc(0.26, 0.68, 0.3, 0.3, -115, 150, 12)]] },
  6: { w: 0.62, strokes: [[[0.5, 0.02], [0.3, 0.14], [0.14, 0.38], [0.07, 0.66], ...arc(0.3, 0.73, 0.23, 0.26, 180, -180, 16)]] },
  7: { w: 0.62, strokes: [[[0.03, 0], [0.57, 0], [0.2, 1]]] },
  8: {
    w: 0.62,
    strokes: [
      Array.from({ length: 25 }, (_, i) => {
        const t = (i / 24) * Math.PI * 2
        return [0.3 - 0.24 * Math.sin(2 * t) * (t < Math.PI ? 0.85 : 1), 0.5 - 0.5 * Math.cos(t)]
      }),
    ],
  },
  9: { w: 0.62, strokes: [[...arc(0.29, 0.28, 0.23, 0.27, 0, -360, 16), [0.5, 0.6], [0.46, 1]]] },
  Q: { w: 0.92, strokes: [arc(0.4, 0.5, 0.36, 0.5, -90, 275, 22), [[0.48, 0.7], [0.84, 1.06]]] },
  P: { w: 0.66, strokes: [[[0.08, 0], [0.08, 1]], [[0.08, 0.03], ...arc(0.12, 0.28, 0.4, 0.26, -90, 90, 12), [0.08, 0.54]]] },
  d: { w: 0.62, strokes: [[...arc(0.26, 0.74, 0.22, 0.26, 0, -360, 16)], [[0.49, 0], [0.49, 1]]] },
  s: {
    w: 0.52,
    strokes: [[[0.43, 0.56], [0.3, 0.49], [0.13, 0.52], [0.08, 0.62], [0.2, 0.72], [0.37, 0.79], [0.43, 0.89], [0.34, 0.98], [0.17, 1.0], [0.05, 0.93]]],
  },
  '=': { w: 0.78, strokes: [[[0.08, 0.4], [0.64, 0.4]], [[0.08, 0.66], [0.64, 0.66]]] },
  '+': { w: 0.76, strokes: [[[0.06, 0.55], [0.62, 0.55]], [[0.34, 0.27], [0.34, 0.83]]] },
  '-': { w: 0.7, strokes: [[[0.1, 0.55], [0.58, 0.55]]] },
  '.': { w: 0.3, strokes: [[[0.1, 0.95], [0.13, 0.98], [0.1, 1.0], [0.08, 0.97], [0.1, 0.95]]] },
}

export const SUPPORTED_CHARS = Object.keys(GLYPHS).join('')

/** Insert points so consecutive samples are at most `step` px apart (like real pointer events). */
function densify(points, step) {
  const out = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const d = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(d / step))
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}

/**
 * Turn a line of text into pen strokes.
 * Characters after "_" are written as subscripts (Q_d), spaces advance the pen.
 *
 * Returns [{ id, points: [{x, y, t}] }] in board pixels.
 */
export function textToStrokes(text, { x = 100, y = 100, height = 46, seed = 1, idPrefix = 's' } = {}) {
  const rnd = mulberry32(seed)
  const jitter = (amount) => (rnd() - 0.5) * 2 * amount
  const slant = 0.08 + jitter(0.05)
  const strokes = []
  let penX = x
  let t = 0
  let sub = false
  for (const ch of text) {
    if (ch === '_') {
      sub = true
      continue
    }
    if (ch === ' ') {
      penX += height * (0.42 + jitter(0.06))
      sub = false
      continue
    }
    const g = GLYPHS[ch]
    if (!g) throw new Error(`strokeFont has no glyph for "${ch}"`)
    const scale = height * (sub ? 0.62 : 1) * (1 + jitter(0.05))
    const baseY = y + height * (sub ? 1.12 : 1) + jitter(height * 0.03)
    const stretch = 1 + jitter(0.07)
    for (const stroke of g.strokes) {
      const px = stroke.map(([gx, gy]) => {
        const yy = baseY - (1 - gy) * scale
        const xx = penX + gx * scale * stretch + (1 - gy) * scale * slant
        return [xx, yy]
      })
      const dense = densify(px, Math.max(2.5, height / 14)).map(([xx, yy]) => [
        xx + jitter(height * 0.012),
        yy + jitter(height * 0.012),
      ])
      strokes.push({
        id: `${idPrefix}${strokes.length}-${Math.floor(rnd() * 1e6).toString(36)}`,
        points: dense.map(([xx, yy]) => ({ x: Math.round(xx * 10) / 10, y: Math.round(yy * 10) / 10, t: (t += 8) })),
      })
      t += 120
    }
    penX += g.w * scale * stretch + height * (0.1 + jitter(0.03))
    sub = false
  }
  return strokes
}

/** Several lines stacked top to bottom. Returns { strokes, lines: [[stroke ids]] }. */
export function linesToStrokes(lines, { x = 120, y = 120, height = 46, lineGap = 1.9, seed = 7 } = {}) {
  const strokes = []
  const groups = []
  lines.forEach((text, i) => {
    const part = textToStrokes(text, {
      x: x + (i % 2) * height * 0.2,
      y: y + i * height * lineGap,
      height,
      seed: seed * 101 + i,
      idPrefix: `l${i}s`,
    })
    groups.push(part.map((s) => s.id))
    strokes.push(...part)
  })
  return { strokes, lines: groups }
}

/** Wire format for POST /api/econ/recognize. */
export function toRecognizePayload(strokes) {
  return { strokes: strokes.map((s) => ({ id: s.id, x: s.points.map((p) => p.x), y: s.points.map((p) => p.y) })) }
}

/** SVG of the strokes on a white background (what the board would look like). */
export function strokesToSvg(strokes, { width = 900, height = 520, strokeWidth = 3.2, color = '#1e293b' } = {}) {
  const paths = strokes
    .map((s) => `<polyline fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" points="${s.points.map((p) => `${p.x},${p.y}`).join(' ')}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${paths}</svg>`
}
