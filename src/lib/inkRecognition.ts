/**
 * Live handwriting recognition over the board's vector ink, fully on-device.
 *
 * The whiteboard stores pen input as vector strokes. This module sends them
 * (normalized to a positive-origin pixel space) to the local API server, which
 * groups them into lines and has the Bonsai vision model transcribe each line
 * (see server/recognize.js). The response becomes an `InkModel`:
 *
 *   - whole-board text, and
 *   - one entry per recognized line carrying the IDs of the strokes that
 *     formed it plus their bounding box in flow coordinates.
 *
 * That line -> stroke-ID map is what lets the tutor say "look at line 3" and
 * have exactly those strokes light up, and what gives the hint-placement
 * logic real occupied-space rectangles instead of guesses.
 *
 * Reading a line takes seconds on a CPU, so the server answers with what it
 * has and flags `pending` when some lines are still unread; callers simply
 * ask again a little later (finished lines are cached server-side).
 */

export interface InkStrokeInput {
  id: string
  points: { x: number; y: number; t?: number; p?: number }[]
}

export interface BoundsRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface RecognizedLine {
  /** 1-based, ordered top-to-bottom by bounds. */
  n: number
  /**
   * Plain-text transcription of the line (e.g. "Qd = 100 - 2P"). The field
   * keeps its historical name; undefined while the line has not been read.
   */
  latex?: string
  /** IDs of the board strokes that drew this line. */
  strokeIds: string[]
  /** Bounding box of those strokes, in flow (board) coordinates. */
  bounds: BoundsRect
}

export interface InkModel {
  /** Text of the whole board, one recognized line per line. */
  latex?: string
  lines: RecognizedLine[]
  /** True when some lines are still being read; ask again shortly. */
  pending?: boolean
}

/** The server has no recognizer at all; callers should stop retrying this session. */
export class RecognitionUnavailableError extends Error {}

/** Margin added when translating flow coords to the recognizer's canvas. */
const MARGIN_PX = 20

interface RecognizeResponse {
  lines?: { strokeIds?: unknown; text?: unknown }[]
  drawings?: { strokeIds?: unknown }[]
  pending?: boolean
  model?: 'ok' | 'unreachable'
}

function boundsOf(strokes: InkStrokeInput[]): BoundsRect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Only the newest request matters: starting one cancels the one in flight. */
let inFlight: AbortController | null = null

export async function recognizeInk(strokes: InkStrokeInput[]): Promise<InkModel> {
  const usable = strokes.filter((s) => s.points.length > 0)
  if (usable.length === 0) return { lines: [] }

  const raw = boundsOf(usable)
  const offX = raw.minX - MARGIN_PX
  const offY = raw.minY - MARGIN_PX
  const round = (v: number) => Math.round(v * 10) / 10

  const payload = {
    width: Math.ceil(raw.maxX - raw.minX + MARGIN_PX * 2),
    height: Math.ceil(raw.maxY - raw.minY + MARGIN_PX * 2),
    strokes: usable.map((s) => ({
      id: s.id,
      x: s.points.map((p) => round(p.x - offX)),
      y: s.points.map((p) => round(p.y - offY)),
    })),
  }

  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller

  let res: Response
  try {
    res = await fetch('/api/econ/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    if (inFlight === controller) inFlight = null
  }
  if (res.status === 501 || res.status === 404) {
    throw new RecognitionUnavailableError('recognition not available')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Recognition failed' }))
    throw new Error(err.error || 'Recognition failed')
  }

  const body = (await res.json()) as RecognizeResponse
  const byId = new Map(usable.map((s) => [s.id, s]))
  const lines: RecognizedLine[] = []
  for (const entry of Array.isArray(body.lines) ? body.lines : []) {
    const ids = Array.isArray(entry.strokeIds)
      ? entry.strokeIds.filter((id): id is string => typeof id === 'string' && byId.has(id))
      : []
    if (ids.length === 0) continue
    const text = typeof entry.text === 'string' ? entry.text.trim() : ''
    lines.push({
      n: 0, // assigned after sorting
      latex: text || undefined,
      strokeIds: ids,
      bounds: boundsOf(ids.map((id) => byId.get(id)!)),
    })
  }

  // The server already orders lines top-to-bottom; sort again from the real
  // bounds so numbering always matches what the student sees.
  lines.sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX)
  lines.forEach((l, i) => (l.n = i + 1))

  const whole = lines
    .map((l) => l.latex)
    .filter(Boolean)
    .join('\n')

  return { latex: whole || undefined, lines, pending: !!body.pending }
}
