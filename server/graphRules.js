/**
 * Rule checks for hand-drawn market graphs, from the pen strokes themselves.
 *
 * The trained graph model is good at naming a graph but rarely catches a
 * mistake in a hand-drawn one. The strokes carry exact geometry, though, so
 * the most common slips can be measured directly:
 *
 *   - which strokes are the axes and which are curves
 *   - which way each curve slopes
 *   - which label (S, D, P, Q) was written next to which curve or axis
 *
 * From that: demand drawn sloping up, supply drawn sloping down, S and D on
 * each other's curves, and P and Q on the wrong axes. Everything here is
 * plain arithmetic; reading the labels is done by the caller (the local
 * vision model) and passed in as text.
 */

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

function pathLength(s) {
  let len = 0
  for (let i = 1; i < s.xs.length; i++) len += Math.hypot(s.xs[i] - s.xs[i - 1], s.ys[i] - s.ys[i - 1])
  return len
}

/** Least-squares slope of y on x (screen coordinates, y grows downward). */
function slopeOf(s) {
  const n = s.xs.length
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += s.xs[i]
    sy += s.ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (s.xs[i] - mx) * (s.ys[i] - my)
    den += (s.xs[i] - mx) ** 2
  }
  return den > 0 ? num / den : Infinity
}

/**
 * Split a graph's big strokes into axes and curves.
 * Returns { frame, axes, curves } where each curve has
 * { stroke, direction: 'up' | 'down' | 'flat' | 'vertical', ends: [[x, y], [x, y]] }
 * ("up" in the economics sense: rises to the right).
 */
export function readGraphGeometry(bigStrokes) {
  const frame = boundsOf(bigStrokes)
  const axes = []
  const curves = []
  for (const s of bigStrokes) {
    const nearLeft = frame.minX + frame.w * 0.14
    const nearBottom = frame.maxY - frame.h * 0.14
    let hugging = 0
    for (let i = 0; i < s.xs.length; i++) {
      if (s.xs[i] <= nearLeft || s.ys[i] >= nearBottom) hugging++
    }
    const cx = (s.minX + s.maxX) / 2
    const cy = (s.minY + s.maxY) / 2
    const lShaped = s.w >= frame.w * 0.55 && s.h >= frame.h * 0.55 && hugging / s.xs.length >= 0.85
    const vertical = s.w <= Math.max(10, s.h * 0.14) && s.h >= frame.h * 0.5 && cx <= frame.minX + frame.w * 0.2
    const horizontal = s.h <= Math.max(10, s.w * 0.14) && s.w >= frame.w * 0.5 && cy >= frame.maxY - frame.h * 0.2
    if (lShaped || vertical || horizontal) {
      axes.push(s)
      continue
    }
    if (pathLength(s) < Math.min(frame.w, frame.h) * 0.3) continue
    const first = [s.xs[0], s.ys[0]]
    const last = [s.xs[s.xs.length - 1], s.ys[s.ys.length - 1]]
    let direction
    if (s.w < frame.w * 0.12) direction = 'vertical'
    else {
      const m = slopeOf(s)
      direction = m < -0.18 ? 'up' : m > 0.18 ? 'down' : 'flat'
    }
    curves.push({ stroke: s, direction, ends: first[0] <= last[0] ? [first, last] : [last, first] })
  }
  return { frame, axes, curves }
}

/** What a written label means on a market graph (null when it is something else). */
export function labelMeaning(text) {
  const t = String(text || '').replace(/[\s.,:;'"*_]/g, '')
  if (!t) return null
  if (/^(s\d?|supply|ss)$/i.test(t)) return 'S'
  if (/^(d\d?|demand|dd)$/i.test(t)) return 'D'
  if (/^(p|price|\$)$/i.test(t)) return 'P'
  if (/^(q|qty|quantity)$/i.test(t)) return 'Q'
  return null
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

/**
 * Check a graph. `labels` is [{ text, bounds: { minX, minY, maxX, maxY } }].
 *
 * Returns null when the graph is not recognizably a supply and demand style
 * graph (no S or D label on a sloped curve), otherwise
 * { name, mistakes: [{ mistake, explanation, fix, box: [x0, y0, x1, y1] }] }.
 */
export function checkMarketGraph(bigStrokes, labels) {
  if (!Array.isArray(bigStrokes) || bigStrokes.length < 2) return null
  const { frame, axes, curves } = readGraphGeometry(bigStrokes)
  if (axes.length === 0) return null
  const sloped = curves.filter((c) => c.direction === 'up' || c.direction === 'down')
  if (sloped.length === 0) return null

  const reach = Math.max(frame.w, frame.h) * 0.3
  const tagged = [] // { meaning, curve }
  const axisLabels = [] // { meaning, center }
  for (const l of labels || []) {
    const meaning = labelMeaning(l.text)
    if (!meaning) continue
    const center = [(l.bounds.minX + l.bounds.maxX) / 2, (l.bounds.minY + l.bounds.maxY) / 2]
    if (meaning === 'P' || meaning === 'Q') {
      axisLabels.push({ meaning, center })
      continue
    }
    let best = null
    let bestDist = reach
    for (const c of sloped) {
      const d = Math.min(distance(center, c.ends[0]), distance(center, c.ends[1]))
      if (d < bestDist) {
        best = c
        bestDist = d
      }
    }
    if (best) tagged.push({ meaning, curve: best })
  }
  if (tagged.length === 0) return null

  const round = (v) => Math.round(v)
  const point = (x, y) => [round(x), round(y)]
  const boxOf = (s) => [s.minX, s.minY, s.maxX, s.maxY].map(round)
  const mistakes = []
  const wrongD = tagged.filter((t) => t.meaning === 'D' && t.curve.direction === 'up')
  const wrongS = tagged.filter((t) => t.meaning === 'S' && t.curve.direction === 'down')
  const rightD = tagged.some((t) => t.meaning === 'D' && t.curve.direction === 'down')
  const rightS = tagged.some((t) => t.meaning === 'S' && t.curve.direction === 'up')

  if (wrongD.length && wrongS.length && !rightD && !rightS) {
    const all = boundsOf([wrongD[0].curve.stroke, wrongS[0].curve.stroke])
    mistakes.push({
      mistake: 'S and D are on the wrong curves',
      explanation:
        'The curve labeled D slopes upward and the curve labeled S slopes downward. Demand slopes down (people buy less at a higher price) and supply slopes up (sellers offer more at a higher price).',
      fix: 'Swap the S and D labels.',
      box: [all.minX, all.minY, all.maxX, all.maxY].map(round),
      correction: {
        labels: [
          { text: 'S', x: round(wrongD[0].curve.ends[1][0] + 14), y: round(wrongD[0].curve.ends[1][1]) },
          { text: 'D', x: round(wrongS[0].curve.ends[1][0] + 14), y: round(wrongS[0].curve.ends[1][1]) },
        ],
      },
    })
  } else {
    for (const t of wrongD) {
      mistakes.push({
        mistake: 'the demand curve slopes upward',
        explanation: 'Demand slopes downward: when the price is higher, people buy less.',
        fix: 'Redraw the curve labeled D so it falls from the upper left to the lower right.',
        box: boxOf(t.curve.stroke),
        correction: {
          lines: [{ label: 'D', pts: [point(t.curve.stroke.minX, t.curve.stroke.minY), point(t.curve.stroke.maxX, t.curve.stroke.maxY)] }],
        },
      })
    }
    for (const t of wrongS) {
      mistakes.push({
        mistake: 'the supply curve slopes downward',
        explanation: 'Supply slopes upward: when the price is higher, sellers offer more.',
        fix: 'Redraw the curve labeled S so it rises from the lower left to the upper right.',
        box: boxOf(t.curve.stroke),
        correction: {
          lines: [{ label: 'S', pts: [point(t.curve.stroke.minX, t.curve.stroke.maxY), point(t.curve.stroke.maxX, t.curve.stroke.minY)] }],
        },
      })
    }
  }

  // P belongs on the vertical axis (top left), Q on the horizontal one (bottom right).
  const p = axisLabels.find((a) => a.meaning === 'P')
  const q = axisLabels.find((a) => a.meaning === 'Q')
  const atBottomRight = (c) => c[0] > frame.minX + frame.w * 0.6 && c[1] > frame.minY + frame.h * 0.7
  const atTopLeft = (c) => c[0] < frame.minX + frame.w * 0.3 && c[1] < frame.minY + frame.h * 0.4
  if ((p && atBottomRight(p.center) && (!q || atTopLeft(q.center))) || (q && atTopLeft(q.center) && (!p || atBottomRight(p.center)))) {
    if (p && q) {
      mistakes.push({
        mistake: 'P and Q are on the wrong axes',
        explanation: 'Price goes on the vertical axis and quantity on the horizontal axis.',
        fix: 'Put P at the top of the vertical axis and Q at the right end of the horizontal axis.',
        box: [frame.minX, frame.minY, frame.maxX, frame.maxY].map(round),
        correction: {
          labels: [
            { text: 'P', x: round(frame.minX - 18), y: round(frame.minY + 10) },
            { text: 'Q', x: round(frame.maxX + 12), y: round(frame.maxY + 20) },
          ],
        },
      })
    }
  }

  return { name: 'supply and demand', mistakes }
}
