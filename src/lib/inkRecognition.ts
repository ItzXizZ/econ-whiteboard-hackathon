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

/** What the local graph checker made of a graph drawn on the board. */
export interface GraphInfo {
  /** recognized = type identified and no mistake flagged, mistake = likely error, unknown = type unclear. */
  status: 'recognized' | 'mistake' | 'unknown'
  /** Readable graph type, e.g. "supply and demand" ('' when unknown). */
  name: string
  /** Readable mistake, e.g. "demand slopes up". */
  mistake?: string
  explanation?: string
  fix?: string
  /** Where the checker thinks the mistake is, in flow (board) coordinates. */
  errorBox?: BoundsRect
  correction?: {
    lines?: { label: string; pts: { x: number; y: number }[] }[]
    labels?: { text: string; x: number; y: number }[]
  }
  labelsPending?: boolean
  /** True when curve slopes and labels were measured from the strokes and found right. */
  checked?: boolean
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
  /** Set when this "line" is a whole graph; `latex` then holds its description. */
  graph?: GraphInfo
}

export interface InkModel {
  /** Text of the whole board, one recognized line per line. */
  latex?: string
  lines: RecognizedLine[]
  /** True when some lines are still being read; ask again shortly. */
  pending?: boolean
  /** All strokes included in this request, including strokes not yet grouped into a line. */
  requestStrokeIds?: string[]
}

/** The server has no recognizer at all; callers should stop retrying this session. */
export class RecognitionUnavailableError extends Error {}

/** Margin added when translating flow coords to the recognizer's canvas. */
const MARGIN_PX = 20

interface RecognizeResponse {
  lines?: { strokeIds?: unknown; text?: unknown; graph?: unknown }[]
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

const GRAPH_STATUSES = ['recognized', 'mistake', 'unknown'] as const

/** Validate the server's graph result and move its error box back into flow coordinates. */
function parseGraph(raw: unknown, offX: number, offY: number): GraphInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const g = raw as Record<string, unknown>
  const status = GRAPH_STATUSES.find((s) => s === g.status)
  if (!status) return undefined
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const info: GraphInfo = {
    status,
    name: str(g.name) ?? '',
    checked: g.checked === true || undefined,
    labelsPending: g.labelsPending === true || undefined,
  }
  if (status === 'mistake') {
    info.mistake = str(g.mistake)
    info.explanation = str(g.explanation)
    info.fix = str(g.fix)
    const b = g.errorBox
    if (Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      info.errorBox = { minX: b[0] + offX, minY: b[1] + offY, maxX: b[2] + offX, maxY: b[3] + offY }
    }
    const correction = g.correction
    if (correction && typeof correction === 'object') {
      const rawCorrection = correction as Record<string, unknown>
      const lines: { label: string; pts: { x: number; y: number }[] }[] = []
      if (Array.isArray(rawCorrection.lines)) {
        for (const rawLine of rawCorrection.lines.slice(0, 6)) {
          if (!rawLine || typeof rawLine !== 'object') continue
          const line = rawLine as Record<string, unknown>
          if (
            typeof line.label !== 'string' ||
            !line.label.trim() ||
            line.label.length > 12 ||
            !Array.isArray(line.pts) ||
            line.pts.length < 2 ||
            line.pts.length > 8
          ) {
            continue
          }
          const pts: { x: number; y: number }[] = []
          for (const rawPoint of line.pts) {
            if (
              !Array.isArray(rawPoint) ||
              rawPoint.length !== 2 ||
              !rawPoint.every((v) => typeof v === 'number' && Number.isFinite(v))
            ) {
              pts.length = 0
              break
            }
            pts.push({ x: rawPoint[0] + offX, y: rawPoint[1] + offY })
          }
          if (pts.length === line.pts.length) lines.push({ label: line.label.trim(), pts })
        }
      }
      const labels: { text: string; x: number; y: number }[] = []
      if (Array.isArray(rawCorrection.labels)) {
        for (const rawLabel of rawCorrection.labels.slice(0, 8)) {
          if (!rawLabel || typeof rawLabel !== 'object') continue
          const label = rawLabel as Record<string, unknown>
          if (
            typeof label.text !== 'string' ||
            !label.text.trim() ||
            label.text.length > 12 ||
            typeof label.x !== 'number' ||
            !Number.isFinite(label.x) ||
            typeof label.y !== 'number' ||
            !Number.isFinite(label.y)
          ) {
            continue
          }
          labels.push({ text: label.text.trim(), x: label.x + offX, y: label.y + offY })
        }
      }
      if (lines.length || labels.length) {
        info.correction = {
          ...(lines.length ? { lines } : {}),
          ...(labels.length ? { labels } : {}),
        }
      }
    }
  }
  return info
}

function copyGraph(graph: GraphInfo): GraphInfo {
  return {
    ...graph,
    ...(graph.errorBox ? { errorBox: { ...graph.errorBox } } : {}),
    ...(graph.correction
      ? {
          correction: {
            ...(graph.correction.lines
              ? { lines: graph.correction.lines.map((line) => ({ ...line, pts: line.pts.map((p) => ({ ...p })) })) }
              : {}),
            ...(graph.correction.labels ? { labels: graph.correction.labels.map((label) => ({ ...label })) } : {}),
          },
        }
      : {}),
  }
}

/** Keep a measured mistake visible while later recognition passes are incomplete. */
export function carryGraphVerdicts(prev: InkModel, next: InkModel): InkModel {
  const lines = next.lines.map((line) => ({
    ...line,
    strokeIds: [...line.strokeIds],
    bounds: { ...line.bounds },
    ...(line.graph ? { graph: copyGraph(line.graph) } : {}),
  }))
  const requestStrokeIds = new Set(next.requestStrokeIds ?? next.lines.flatMap((line) => line.strokeIds))

  for (const prevLine of prev.lines) {
    if (prevLine.graph?.status !== 'mistake') continue
    const prevIds = new Set(prevLine.strokeIds)
    if (prevIds.size === 0) continue

    let bestIndex = -1
    let bestOverlap = 0
    for (let i = 0; i < lines.length; i++) {
      const overlap = lines[i].strokeIds.reduce((count, id) => count + Number(prevIds.has(id)), 0)
      if (overlap > bestOverlap) {
        bestIndex = i
        bestOverlap = overlap
      }
    }

    if (bestIndex >= 0 && bestOverlap / prevIds.size >= 0.6) {
      const target = lines[bestIndex]
      const graph = target.graph
      const genuineFix =
        !next.pending && graph?.status === 'recognized' && graph.checked && !graph.labelsPending
      const shouldCarry =
        !genuineFix &&
        (!graph ||
          graph.status === 'unknown' ||
          graph.labelsPending ||
          (next.pending && graph.status !== 'mistake'))
      if (shouldCarry) lines[bestIndex] = { ...target, graph: copyGraph(prevLine.graph) }
    } else if (bestOverlap === 0 && next.pending) {
      const stillPresent = [...prevIds].filter((id) => requestStrokeIds.has(id)).length
      if (stillPresent / prevIds.size >= 0.6) {
        lines.push({
          ...prevLine,
          strokeIds: [...prevLine.strokeIds],
          bounds: { ...prevLine.bounds },
          graph: copyGraph(prevLine.graph),
        })
      }
    }
  }

  lines.sort((a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX)
  lines.forEach((line, i) => (line.n = i + 1))
  const latex = lines.map((line) => line.latex).filter(Boolean).join('\n')
  return { ...next, latex: latex || undefined, lines }
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
      graph: parseGraph(entry.graph, offX, offY),
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

  return { latex: whole || undefined, lines, pending: !!body.pending, requestStrokeIds: usable.map((s) => s.id) }
}
