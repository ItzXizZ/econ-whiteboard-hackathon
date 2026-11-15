/**
 * Synthetic hand-drawn graphs for tests: wobbly axes, curves and labels as pen
 * strokes, in the same shape the whiteboard sends to /api/econ/recognize.
 */
import { mulberry32, textToStrokes, SUPPORTED_CHARS } from './strokeFont.mjs'

function wobbly(rand, pts, id, n = 26, amp = 2.2) {
  const xs = []
  const ys = []
  const segs = pts.length - 1
  for (let i = 0; i <= n * segs; i++) {
    const t = i / n
    const k = Math.min(segs - 1, Math.floor(t))
    const f = t - k
    xs.push(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (rand() - 0.5) * amp)
    ys.push(pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (rand() - 0.5) * amp)
  }
  return { id, x: xs, y: ys }
}

/** Letters the stroke font lacks, as rough pen strokes in a unit box (y down). */
const LETTERS = {
  S: [[[0.85, 0.15], [0.55, 0.0], [0.2, 0.08], [0.12, 0.3], [0.45, 0.48], [0.8, 0.66], [0.78, 0.9], [0.45, 1.0], [0.1, 0.86]]],
  D: [[[0.15, 0.0], [0.15, 1.0]], [[0.15, 0.0], [0.6, 0.08], [0.85, 0.5], [0.6, 0.92], [0.15, 1.0]]],
}

function label(text, x, y, seed, prefix, height = 26) {
  const rand = mulberry32(seed)
  const out = []
  let penX = x
  for (const ch of text) {
    if (LETTERS[ch]) {
      LETTERS[ch].forEach((pts, k) => {
        out.push(wobbly(rand, pts.map(([gx, gy]) => [penX + gx * height * 0.7, y + gy * height]), `${prefix}${ch}${k}`, 6, 0.8))
      })
      penX += height * 0.85
    } else if (SUPPORTED_CHARS.includes(ch)) {
      for (const st of textToStrokes(ch, { x: penX, y, height, seed: seed + out.length, idPrefix: `${prefix}${ch}` })) {
        out.push({ id: st.id, x: st.points.map((p) => p.x), y: st.points.map((p) => p.y) })
      }
      penX += height * 0.85
    } else if (ch === ' ') {
      penX += height * 0.45
    } else {
      throw new Error(`graphFixture has no glyph for "${ch}"`)
    }
  }
  return out
}

/**
 * A supply and demand graph at (ox, oy), `size` px wide.
 * kind: 'correct' | 'demand_up' (demand drawn sloping up) | 'labels_swapped' | 'axes_swapped'
 */
export function supplyDemandStrokes({ ox = 640, oy = 120, size = 320, kind = 'correct', seed = 3 } = {}) {
  const rand = mulberry32(seed)
  const h = size * 0.8
  const strokes = []
  // Axes as one L-shaped stroke plus the two curves.
  strokes.push(wobbly(rand, [[ox, oy], [ox, oy + h], [ox + size, oy + h]], 'g_axes'))
  strokes.push(wobbly(rand, [[ox + size * 0.12, oy + h * 0.88], [ox + size * 0.88, oy + h * 0.12]], 'g_supply'))
  strokes.push(
    kind === 'demand_up'
      ? wobbly(rand, [[ox + size * 0.3, oy + h * 0.92], [ox + size * 0.95, oy + h * 0.3]], 'g_demand')
      : wobbly(rand, [[ox + size * 0.12, oy + h * 0.12], [ox + size * 0.88, oy + h * 0.88]], 'g_demand')
  )
  // Where each label is written. `kind` moves labels to make the classic mistakes.
  const upEnd = [ox + size * 0.9, oy + h * 0.02]
  const downEnd = [ox + size * 0.9, oy + h * 0.8]
  const supplyAt = kind === 'labels_swapped' ? downEnd : upEnd
  const demandAt = kind === 'labels_swapped' ? upEnd : kind === 'demand_up' ? [ox + size * 0.99, oy + h * 0.3] : downEnd
  const sAt = kind === 'demand_up' ? [ox + size * 0.9, oy + h * 0.02] : supplyAt
  strokes.push(...label('S', sAt[0], sAt[1], seed + 1, 'g_ls'))
  strokes.push(...label('D', demandAt[0], demandAt[1], seed + 2, 'g_ld'))
  const pAt = kind === 'axes_swapped' ? [ox + size - 8, oy + h + 12] : [ox - 34, oy - 6]
  const qAt = kind === 'axes_swapped' ? [ox - 34, oy - 6] : [ox + size - 8, oy + h + 12]
  strokes.push(...label('P', pAt[0], pAt[1], seed + 3, 'g_lp'))
  strokes.push(...label('Q', qAt[0], qAt[1], seed + 4, 'g_lq'))
  return strokes
}
