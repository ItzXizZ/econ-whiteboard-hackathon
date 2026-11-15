import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { EdgeLabelRenderer, useReactFlow, useViewport } from 'reactflow'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LineChart,
  Loader2,
  PenLine,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useStore } from '../../store/useStore'
import { streamMathHint, type HintTurn } from '../../lib/mathHint'
import type { TutorGraphSpec } from '../../lib/mathHint'
import {
  circleOps,
  correctionOps,
  graphWrongCurveStrokes,
  isWholeCurveMistake,
  specToPenOps,
  type PenOp,
} from '../../lib/tutorPen'
import { useTutorPen } from '../../lib/useTutorPen'
import {
  isCurveShifted,
  isPointRelativeToCurve,
  isPpfCurve,
  isPpfGrowth,
  isValidCurveStroke,
  curveEquilibrium,
  equilibriumLabelPositions,
  pickTogetherLesson,
  placeLabelAwayFromStrokes,
  pointLabelPosition,
  ppfBulgePoint,
  replaceCorrectionOpIds,
  shiftedEquilibriumLabel,
  strokeFitsBox,
  TOGETHER_LESSONS,
  type TogetherLesson,
  type TogetherBox,
  type TogetherStroke,
  type TogetherViewport,
} from '../../lib/drawTogether'
import {
  ladderTypeForLevel,
  isHintTypeId,
  type HintTypeId,
  type SessionPhase,
} from '../../math/session'
import {
  createRecognizer,
  speechRecognitionSupported,
  speechRecognitionEngine,
  probeSTT,
  probeTTS,
  IncrementalSpeaker,
  cancelSpeech,
  type RecognizerHandle,
} from '../../lib/voiceTutor'
import { loadMathBoard, saveMathBoard, clearMathBoard } from '../../lib/mathBoardStorage'
import {
  carryGraphVerdicts,
  recognizeInk,
  RecognitionUnavailableError,
  type GraphInfo,
  type InkModel,
} from '../../lib/inkRecognition'
import {
  boundsFromPoints,
  unionBounds,
  mainInkBounds,
  type BoardBounds,
  type ScreenRect,
} from '../../lib/mathBoardManifest'
import {
  parseNarration,
  stripMarkers,
  extractHighlightLineNumbers,
  hasWriteMarker,
  ensureWriteMarker,
} from '../../lib/tutorNarration'
import { speakableMathText } from '../../lib/mathSpeech'
import { MathTutorHighlight, MathTutorScreenLayer } from './MathTutorOverlay'
import MathGuidedSpotlight, {
  resolveFiredMarkers,
  type WriteZoneState,
} from './MathGuidedSpotlight'

type Tool = 'off' | 'pen' | 'eraser' | 'highlight'

function equationToBoardText(tex: string): string {
  return tex
    .replace(/\\;\\Rightarrow\\;/g, ' ⇒ ')
    .replace(/\\;/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/\\ /g, ' ')
    .replace(/Q_d/g, 'Qd')
    .replace(/Q_s/g, 'Qs')
    .replace(/P_b/g, 'Pb')
    .replace(/P_s/g, 'Ps')
    .replace(/Q_t/g, 'Qt')
    .replace(/\^\*/g, '*')
    .replace(/\s+/g, ' ')
    .trim()
}

let togetherOpId = 0

function tutorPenStroke(
  points: { x: number; y: number }[],
  color: string,
  width: number,
  dashed = false
): PenOp {
  return {
    kind: 'stroke',
    stroke: {
      id: `together-${togetherOpId++}`,
      points,
      color,
      width,
      ...(dashed ? { dashed: true } : {}),
    },
  }
}

function tutorPenLabel(
  x: number,
  y: number,
  text: string,
  color = '#2563eb',
  size = 16
): PenOp {
  return {
    kind: 'label',
    label: { id: `together-${togetherOpId++}`, x, y, text, color, size },
  }
}

function tutorStrokeBounds(stroke: Stroke): BoardBounds | null {
  if (stroke.points.length === 0) return null
  const first = stroke.points[0]
  return stroke.points.reduce<BoardBounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y }
  )
}

function recognitionOverrideKey(strokeIds: string[]): string {
  return [...strokeIds].sort().join(',')
}

function overlapsTogetherBox(bounds: BoardBounds, box: TogetherBox): boolean {
  return bounds.minX <= box.x + box.w && bounds.maxX >= box.x && bounds.minY <= box.y + box.h && bounds.maxY >= box.y
}

function tutorLabelOp(
  preferred: { x: number; y: number },
  text: string,
  obstacles: TogetherStroke[],
  color = '#2563eb',
  size = 16,
  viewport?: TogetherViewport
): PenOp {
  const position = placeLabelAwayFromStrokes(preferred, text, obstacles, size, viewport)
  return tutorPenLabel(position.x, position.y, text, color, size)
}

function tutorLabelObstacle(label: { text: string; x: number; y: number; size: number }): TogetherStroke {
  const width = label.text.length * label.size * 0.65
  const top = label.y - label.size
  const bottom = label.y + label.size * 0.25
  return {
    points: [
      { x: label.x, y: top },
      { x: label.x + width, y: top },
      { x: label.x + width, y: bottom },
      { x: label.x, y: bottom },
      { x: label.x, y: top },
    ],
  }
}

function tutorAxesOps(
  box: TogetherBox,
  yLabel = 'P',
  xLabel = 'Q',
  obstacles: TogetherStroke[] = [],
  viewport?: TogetherViewport
): PenOp[] {
  const left = box.x + 42
  const top = box.y + 22
  const right = box.x + box.w - 14
  const bottom = box.y + box.h - 26
  const axes: TogetherStroke = {
    points: [{ x: left, y: top }, { x: left, y: bottom }, { x: right, y: bottom }],
    width: 3,
  }
  const labelObstacles = [...obstacles, axes]
  const yLabelWidth = yLabel.length * 15 * 0.65
  return [
    tutorPenStroke(axes.points, '#334155', 3),
    tutorLabelOp(
      { x: left - yLabelWidth - 10, y: top + 5 },
      yLabel,
      labelObstacles,
      '#334155',
      15,
      viewport
    ),
    tutorLabelOp(
      { x: right + 4, y: bottom + 20 },
      xLabel,
      labelObstacles,
      '#334155',
      15,
      viewport
    ),
  ]
}

function tutorCurveLabel(
  stroke: Stroke,
  text: string,
  obstacles: TogetherStroke[],
  anchor?: { x: number; y: number },
  viewport?: TogetherViewport
): PenOp {
  const point = anchor ?? stroke.points.reduce((right, current) => (current.x > right.x ? current : right))
  const preferred = viewport
    ? pointLabelPosition(point, text, 16, viewport)
    : { x: point.x + 8, y: point.y + 4 }
  return tutorLabelOp(preferred, text, obstacles, '#2563eb', 16, viewport)
}

function tutorEquilibriumOps(
  box: TogetherBox,
  point: { x: number; y: number },
  priceLabel: string,
  quantityLabel: string,
  obstacles: TogetherStroke[] = [],
  otherPoint?: { x: number; y: number },
  viewport?: TogetherViewport
): PenOp[] {
  const left = box.x + 42
  const bottom = box.y + box.h - 26
  const guides: TogetherStroke[] = [
    { points: [{ ...point }, { x: point.x, y: bottom }], width: 2 },
    { points: [{ ...point }, { x: left, y: point.y }], width: 2 },
  ]
  const dot = Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return { x: point.x + Math.cos(angle) * 4, y: point.y + Math.sin(angle) * 4 }
  })
  const labelObstacles = [...obstacles, ...guides, { points: dot, width: 2 }]
  const labels = equilibriumLabelPositions(box, point, priceLabel, quantityLabel, otherPoint)
  return [
    tutorPenStroke(guides[0].points, '#64748b', 2, true),
    tutorPenStroke(guides[1].points, '#64748b', 2, true),
    tutorPenStroke(dot, '#0f172a', 2),
    tutorLabelOp(labels.price, priceLabel, labelObstacles, '#475569', 13, viewport),
    tutorLabelOp(
      labels.quantity,
      quantityLabel,
      labelObstacles,
      '#475569',
      13,
      viewport
    ),
  ]
}

function tutorArrowOps(
  from: { x: number; y: number },
  to: { x: number; y: number }
): PenOp[] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const headLength = 18
  const wing = 0.6
  const base = {
    x: to.x - Math.cos(angle) * headLength,
    y: to.y - Math.sin(angle) * headLength,
  }
  return [
    tutorPenStroke([from, to], '#7c3aed', 3.5),
    tutorPenStroke(
      [
        { x: base.x + Math.cos(angle + wing) * headLength, y: base.y + Math.sin(angle + wing) * headLength },
        to,
        { x: base.x + Math.cos(angle - wing) * headLength, y: base.y + Math.sin(angle - wing) * headLength },
      ],
      '#7c3aed',
      3.5
    ),
  ]
}

/** A single ink point. `t` (epoch ms) and `p` (pointer pressure 0–1) feed the
 * handwriting recognizer; both are optional so boards saved before they were
 * captured still load. */
interface InkPoint {
  x: number
  y: number
  t?: number
  p?: number
}

/** A pen stroke stored in flow (board) coordinates so it pans & zooms with the canvas. */
interface Stroke {
  id: string
  color: string
  /** Width in flow units (so it scales with zoom, like ink on paper). */
  width: number
  points: InkPoint[]
}

function graphCorrectionOps(
  graph: GraphInfo,
  strokeIds: string[],
  strokes: Stroke[]
): PenOp[] {
  return correctionOps(graph, graphWrongCurveStrokes(graph, strokeIds, strokes))
}

type TogetherNeed =
  | 'first'
  | 'second'
  | 'shift'
  | 'ppf-frontier'
  | 'inside-point'
  | 'outside-point'
  | 'ppf-growth'

interface TogetherSession {
  id: string
  box: TogetherBox
  lesson: TogetherLesson
  step: number
  awaiting: TogetherNeed | null
  baselineIds: Set<string>
  correctionOpIds: string[]
  correctionBounds: BoardBounds[]
  tutorLabels: Array<{ id: string; text: string; x: number; y: number; color: string; size: number }>
  first?: Stroke
  second?: Stroke
  shifted?: Stroke
  frontier?: Stroke
  insidePoint?: Stroke
  outsidePoint?: Stroke
  growth?: Stroke
  completed?: boolean
  equilibrium?: { x: number; y: number }
}

/** A pasted / uploaded image placed on the board, in flow coordinates. */
interface ImgEl {
  id: string
  src: string
  x: number
  y: number
  w: number
  h: number
}

/** Flow bounds of pasted problem images — treated as occupied board space. */
function imageOccupied(images: ImgEl[]): BoardBounds[] {
  return images.map((im) => ({ minX: im.x, minY: im.y, maxX: im.x + im.w, maxY: im.y + im.h }))
}

/**
 * Past write boxes on this card only — NOT pasted problem images.
 * Images still block overlap inside findBlankWriteBox via a separate pass;
 * including them here used to shove new boxes below a tall screenshot.
 */
function cardWriteOccupied(card?: HintCard): BoardBounds[] {
  if (!card) return []
  const extra: BoardBounds[] = [...(card.usedWriteBoxes ?? [])]
  for (const b of Object.values(card.writeBoxes ?? {})) extra.push(b)
  if (card.heldZone) extra.push(card.heldZone.box)
  return extra
}

/** Pasted problems + prior write boxes (legacy callers that need both). */
function cardOccupied(images: ImgEl[], card?: HintCard): BoardBounds[] {
  const occupied = imageOccupied(images)
  const writes = cardWriteOccupied(card)
  return writes.length ? [...occupied, ...writes] : occupied
}

interface HintCard {
  id: string
  /** Where the tutor writes on the board (flow coordinates). */
  anchor: { x: number; y: number }
  /** Highlight region on the board (flow coordinates). */
  regionFlow?: { x: number; y: number; w: number; h: number }
  region?: string
  boardImage?: string
  /** Raw SAY narration — includes inline [[...]] board markers + LaTeX. */
  text: string
  strategy?: string
  step?: string
  status: 'loading' | 'streaming' | 'done' | 'error'
  error?: string
  history: HintTurn[]
  followup: string
  mode: 'hint' | 'solve' | 'generalize' | 'voice' | 'together'
  togetherMode?: boolean
  togetherStep?: number
  togetherTitle?: string
  togetherTotal?: number
  suggestedLesson?: { id: string; title: string }
  successPulse?: boolean
  level: number
  hintType?: HintTypeId
  tracked: boolean
  responded?: boolean
  /** How many inline markers the narration typewriter has crossed. */
  firedMarkers: number
  /** State of each fired write-zone marker, keyed by marker index. */
  writeStates: Record<number, WriteZoneState>
  /** Fixed flow bounds for each write box — locked when the marker first appears. */
  writeBoxes: Record<number, BoardBounds>
  /** Prior write-box regions on this card — keeps new boxes in fresh blank space. */
  usedWriteBoxes?: BoardBounds[]
  /**
   * A write box the student submitted for checking. Kept on the card (not the
   * narration) so it stays visible while/after the tutor reads it, instead of
   * vanishing the moment new narration replaces the old markers.
   */
  heldZone?: { box: BoardBounds; label?: string; state: 'checking' | 'done' }
  complete?: boolean
  boardBounds?: BoardBounds
  /** How many times the student clicked "Give me another hint" on this card. */
  nudgeCount?: number
  /** Max ladder rung chosen via Small/Medium/Large when the card was created. */
  maxLevel?: number
  /** Clarifying Q&A appended below the main hint — never replaces it. */
  clarifications?: Array<{
    id: string
    question: string
    answer: string
    status: 'loading' | 'streaming' | 'done'
    graph?: TutorGraphSpec
  }>
  /** A graph the tutor drew for this reply. */
  graph?: TutorGraphSpec
  /** Each STEP field parsed from this hint — only `steps[steps.length - 1]` may carry a write marker. */
  steps: string[]
  /** How many of `steps` are currently revealed into `text` (gated behind a check-in response). */
  revealedSteps: number
  /** Per-step-index count of "I'm confused" re-explain attempts (capped in the UI). */
  reexplainCounts: Record<number, number>
  /** True while a re-explain request for the currently-gating step is in flight. */
  reexplaining?: boolean
}

const DEFAULT_HINT_PROMPT =
  'Read my work first: what strategy have I started and what step am I on? Then give ONE hint for my very next move from the equations I already wrote — not a shortcut from a different approach.'

const HINT_SIZES = [
  { level: 1 as const, label: 'Small', title: 'Small hint — gentle nudge' },
  { level: 2 as const, label: 'Medium', title: 'Medium hint — concept or strategy' },
  { level: 4 as const, label: 'Large', title: 'Large hint — concrete next step' },
]

/** Em dashes are banned from all tutor output — soften them into commas. */
function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ', ').replace(/—/g, ', ')
}

/**
 * Strip markdown the model sometimes emits despite instructions. By default
 * also strips [[...]] board markers (for plain display text like clarify/
 * voice, which never carry them anyway). Pass `keepMarkers` for hint-mode
 * STEP text, which MUST retain [[write|...]] / [[highlight|...]] syntax —
 * `card.text` is what TutorNarration's typewriter parses to fire them in
 * sync with the reveal; stripping them here would silently disable both
 * features. TutorNarration and speakableNarration already know to hide
 * marker syntax from what's shown/spoken, so keeping it in the stored text
 * is always safe.
 */
function cleanTutorProse(text: string, opts: { keepMarkers?: boolean } = {}): string {
  const cleaned = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\nCOMPLETE:\s*(yes|no|true|false)\s*/gi, '\n')
  return stripEmDashes(opts.keepMarkers ? cleaned : stripMarkers(cleaned)).trim()
}

/** Small = 1 micro-step, Medium = up to 2, Large = up to 3 — mirrors server/math.js's cap. */
function maxStepsForLevel(level: number): number {
  if (level >= 4) return 3
  if (level === 2) return 2
  return 1
}

/**
 * Parse the structured hint format (WHERE / TYPE / COMPLETE / STEP 1 / STEP 2 / STEP 3).
 * Handles partial streams. `steps` holds each STEP field's text separately —
 * only `steps[steps.length - 1]` may legitimately carry a [[write|...]] marker.
 * Falls back to the legacy single SAY/HINT body (or a bare tail) for any
 * response that never produces a "STEP 1:" header, so older/deviating model
 * output still renders as a single-step hint instead of nothing.
 */
function parseHintResponse(acc: string): {
  type?: HintTypeId
  strategy?: string
  step?: string
  complete?: boolean
  hint: string
  steps: string[]
} {
  if (!acc.trim()) return { hint: '', steps: [] }

  const typeM = acc.match(/TYPE:\s*([a-z]+)/i)
  const type =
    typeM && isHintTypeId(typeM[1].toLowerCase()) ? (typeM[1].toLowerCase() as HintTypeId) : undefined

  const completeM = acc.match(/COMPLETE:\s*(yes|true|no|false)/i)
  const complete = completeM ? /^(yes|true)$/i.test(completeM[1]) : undefined

  const whereM = acc.match(
    /WHERE:\s*([\s\S]*?)(?=\n\s*TYPE:|\n\s*COMPLETE:|\n\s*(?:STEP\s*1|SAY|HINT):|$)/i
  )
  let strategy: string | undefined
  let step: string | undefined
  if (whereM) {
    strategy = whereM[1].match(/Strategy:\s*(.+)/i)?.[1]?.trim()
    step = whereM[1].match(/Step:\s*(.+)/i)?.[1]?.trim()
  }

  let steps: string[] = []
  let hint = ''

  const step1Idx = acc.search(/STEP\s*1\s*:/i)
  if (step1Idx !== -1) {
    // Split the body into each STEP field's raw text. parts[0] is always ''
    // (everything before the first "STEP 1:" match), so drop it.
    const body = acc.slice(step1Idx)
    steps = body
      .split(/STEP\s*\d+\s*:\s*/i)
      .slice(1)
      .map((s) => cleanTutorProse(s.trim(), { keepMarkers: true }))
      .filter(Boolean)
    hint = steps.join(' ')
  } else {
    const hintM = acc.match(/(?:SAY|HINT):\s*([\s\S]*)/i)
    hint = hintM ? hintM[1].trim() : ''

    // Legacy / in-progress: TYPE then body without a SAY:/HINT: label
    if (!hint && typeM) {
      const tail = acc.slice(acc.indexOf(typeM[0]) + typeM[0].length).trim()
      if (tail && !/^WHERE:/i.test(tail)) hint = tail.replace(/^(?:SAY|HINT):\s*/i, '').trim()
    }

    // Still streaming structural headers — hide partial noise
    if (!hint && !whereM && !typeM) {
      if (
        /^\s*(W(H(E(R(E(:)?)?)?)?)?)?$/i.test(acc) ||
        /^\s*T(Y(P(E(:\s*[a-z]*)?)?)?)?$/i.test(acc) ||
        /^\s*S(A(Y(:)?)?)?$/i.test(acc) ||
        /^\s*S(T(E(P(\s*1)?)?)?)?$/i.test(acc)
      ) {
        return { hint: '', steps: [] }
      }
      if (!/^WHERE:/i.test(acc)) hint = acc.trim()
    }

    hint = cleanTutorProse(hint, { keepMarkers: true })
    steps = hint ? [hint] : []
  }

  return { type, strategy, step, complete, hint, steps }
}

/**
 * Spoken form of the narration streamed so far: markers stripped, LaTeX
 * converted to words, and any still-incomplete trailing marker/math span held
 * back so speech never reads half a construct. Deterministic and append-only,
 * so deltas can be pushed to the incremental speaker.
 */
function speakableNarration(sayRaw: string, done: boolean): string {
  const { tokens, pendingTail } = parseNarration(sayRaw, done)
  let stable = ''
  for (const t of tokens) {
    if (t.kind === 'text') stable += t.text
    else if (t.kind === 'math') stable += ` \\(${t.tex}\\) `
    else stable += ' '
  }
  if (done && pendingTail) stable += ` ${stripMarkers(pendingTail)} `
  return speakableMathText(stable)
}

/** Speak an already-complete step's text aloud in one shot (used when a gated step is revealed). */
function speakStepAloud(speaker: IncrementalSpeaker | null, text: string) {
  if (!speaker || !text.trim()) return
  const spoken = speakableNarration(text, true)
  const parts = spoken.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? []
  for (const part of parts) speaker.pushSentence(part)
}

const PEN_COLORS = ['#1e293b', '#2563eb', '#dc2626', '#059669', '#d97706', '#0d9488']
const QUICK_PEN_COLORS = ['#111111', '#2563eb', '#dc2626', '#16a34a']
const PEN_SIZES = [2.5, 4, 7]
const CAPTURE_BG = '#d7d7d7'
/** How long a student can stall (no drawing) before the tutor offers help. */
/** Frosted "selected" liquid-glass state — shared by every toolbar toggle. */
const ACTIVE_GLASS: React.CSSProperties = {
  background: 'linear-gradient(-75deg, rgba(255,255,255,0.55), rgba(255,255,255,0.82), rgba(255,255,255,0.5))',
  boxShadow:
    'inset 0 0 0 1.5px rgba(0,0,0,0.2), inset 0 0.125em 0.125em rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.06)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  color: '#111',
  fontWeight: 600,
}

type ToolbarDock = 'top' | 'bottom' | 'left' | 'right' | 'free'
const TOOLBAR_DOCK_KEY = 'math-toolbar-dock-v1'
const TOOLBAR_SNAP_PX = 56

function readToolbarDock(): { dock: ToolbarDock; free: { x: number; y: number } } {
  try {
    const raw = sessionStorage.getItem(TOOLBAR_DOCK_KEY)
    if (raw) return JSON.parse(raw) as { dock: ToolbarDock; free: { x: number; y: number } }
  } catch {
    /* ignore */
  }
  return { dock: 'top', free: { x: 0, y: 0 } }
}

function snapToolbarDock(
  x: number,
  y: number,
  w: number,
  h: number,
  paneW: number,
  paneH: number,
): { dock: ToolbarDock; free: { x: number; y: number } } {
  const distTop = y
  const distBottom = paneH - y - h
  const distLeft = x
  const distRight = paneW - x - w
  const min = Math.min(distTop, distBottom, distLeft, distRight)
  if (min > TOOLBAR_SNAP_PX) return { dock: 'free', free: { x, y } }
  if (min === distTop) return { dock: 'top', free: { x: 0, y: 0 } }
  if (min === distBottom) return { dock: 'bottom', free: { x: 0, y: 0 } }
  if (min === distLeft) return { dock: 'left', free: { x: 0, y: 0 } }
  return { dock: 'right', free: { x: 0, y: 0 } }
}

type ToolbarSize = { w: number; h: number }

/** Screen-space rect for the faint dock preview while dragging.
 *  `size` must be the footprint the bar will have in that dock orientation. */
function toolbarDockGhostRect(
  dock: ToolbarDock,
  size: ToolbarSize,
  paneW: number,
  paneH: number,
  competition: boolean,
): { left: number; top: number; width: number; height: number } | null {
  if (dock === 'free') return null
  const topOffset = competition ? 12 : 8
  // Keep the preview above the mic / voice control at the bottom edge.
  const bottomOffset = 76
  const { w, h } = size
  switch (dock) {
    case 'top':
      return { left: (paneW - w) / 2, top: topOffset, width: w, height: h }
    case 'bottom':
      return { left: (paneW - w) / 2, top: paneH - bottomOffset - h, width: w, height: h }
    case 'left':
      return {
        left: 12,
        top: Math.max(topOffset, (paneH - h) / 2),
        width: w,
        height: h,
      }
    case 'right':
      return {
        left: paneW - 12 - w,
        top: Math.max(topOffset, (paneH - h) / 2),
        width: w,
        height: h,
      }
    default:
      return null
  }
}

/** Briefly flip the shell's flex layout off-screen to measure the other orientation. */
function measureToolbarOrientation(el: HTMLElement, vertical: boolean): ToolbarSize {
  const body = el.querySelector('.math-toolbar-body') as HTMLElement | null
  const prev = {
    className: el.className,
    cssText: el.style.cssText,
    bodyCss: body?.style.cssText ?? '',
    kids: [] as { el: HTMLElement; css: string }[],
  }
  if (body) {
    body.querySelectorAll<HTMLElement>(':scope > div').forEach((kid) => {
      prev.kids.push({ el: kid, css: kid.style.cssText })
    })
  }

  el.classList.toggle('is-vertical', vertical)
  el.classList.remove('is-dragging', 'dock-top', 'dock-bottom', 'dock-left', 'dock-right')
  el.style.position = 'absolute'
  el.style.left = '-10000px'
  el.style.top = '0'
  el.style.transform = 'none'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.visibility = 'hidden'
  el.style.pointerEvents = 'none'
  el.style.width = 'max-content'
  el.style.height = 'max-content'
  el.style.maxWidth = 'none'
  el.style.maxHeight = 'none'

  if (body) {
    body.style.display = 'flex'
    body.style.flexDirection = vertical ? 'column' : 'row'
    body.style.flexWrap = 'nowrap'
    body.style.alignItems = vertical ? 'stretch' : 'center'
    body.style.width = vertical ? '' : 'max-content'
    body.style.maxWidth = 'none'
    body.style.maxHeight = vertical ? 'min(70vh, 640px)' : 'none'
    body.style.overflow = vertical ? 'auto' : 'visible'
    prev.kids.forEach(({ el: kid }) => {
      kid.style.display = 'flex'
      kid.style.flexDirection = vertical ? 'column' : 'row'
      kid.style.alignItems = vertical ? 'stretch' : 'center'
    })
  }

  const size = { w: el.offsetWidth, h: el.offsetHeight }

  el.className = prev.className
  el.style.cssText = prev.cssText
  if (body) body.style.cssText = prev.bodyCss
  prev.kids.forEach(({ el: kid, css }) => {
    kid.style.cssText = css
  })

  return size
}

const TOOLBAR_FLIP_MS = 320
const TOOLBAR_FLIP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** Positional styles are CSS classes / direct DOM — never React `style`, so
 *  re-renders mid-drag cannot clear the live translate3d. */
function toolbarShellStyle(
  free: { x: number; y: number },
  dock: ToolbarDock,
  dragging: boolean,
  snapping: boolean,
): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    zIndex: dragging || snapping ? 60 : 45,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
  }
  if (dragging || snapping) {
    return { ...base, touchAction: 'none', userSelect: 'none', willChange: 'transform' }
  }
  // Free dock: commit left/top once. Docked edges use CSS classes instead.
  if (dock === 'free') {
    return { ...base, left: free.x, top: free.y }
  }
  return base
}

let seq = 0
const uid = () => `${Date.now().toString(36)}-${seq++}`

/**
 * The ink <svg> lives inside the (transformed) edge-label layer. A 0×0 svg with
 * overflow:visible is not reliably painted by Chrome, so we give it a large
 * real surface and shift all flow coordinates by INK_OFFSET into it.
 */
const INK_OFFSET = 100000

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const c = (p: { x: number; y: number }) => `${p.x + INK_OFFSET} ${p.y + INK_OFFSET}`
  if (points.length === 1) {
    const p = points[0]
    return `M ${c(p)} L ${p.x + INK_OFFSET + 0.01} ${p.y + INK_OFFSET}`
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${c(p)}`).join(' ')
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function strokeHit(p: { x: number; y: number }, st: Stroke, threshold: number): boolean {
  const pts = st.points
  if (pts.length === 0) return false
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < threshold + st.width
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(p, pts[i - 1], pts[i]) < threshold + st.width) return true
  }
  return false
}

function imageHit(p: { x: number; y: number }, im: ImgEl): boolean {
  return p.x >= im.x && p.x <= im.x + im.w && p.y >= im.y && p.y <= im.y + im.h
}

function screenRectToFlow(
  rect: { x: number; y: number; w: number; h: number },
  rf: ReturnType<typeof useReactFlow>,
  wrapRect: DOMRect
) {
  const tl = rf.screenToFlowPosition({ x: wrapRect.left + rect.x, y: wrapRect.top + rect.y })
  const br = rf.screenToFlowPosition({
    x: wrapRect.left + rect.x + rect.w,
    y: wrapRect.top + rect.y + rect.h,
  })
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
}

/** Place tutor note beside or below the highlighted work. */
function tutorAnchorFromRect(
  rect: { x: number; y: number; w: number; h: number },
  rf: ReturnType<typeof useReactFlow>,
  wrapRect: DOMRect
) {
  const preferBelow = rect.y + rect.h + 90 < wrapRect.height
  const screenX = preferBelow ? rect.x + 8 : rect.x + rect.w + 20
  const screenY = preferBelow ? rect.y + rect.h + 14 : rect.y + rect.h * 0.15
  return rf.screenToFlowPosition({ x: wrapRect.left + screenX, y: wrapRect.top + screenY })
}

function strokeCentroid(strokes: Stroke[]): { x: number; y: number } | null {
  let sx = 0
  let sy = 0
  let n = 0
  for (const st of strokes) {
    for (const p of st.points) {
      sx += p.x
      sy += p.y
      n++
    }
  }
  return n ? { x: sx / n, y: sy / n } : null
}

export default function MathLayer({
  adventureId,
  onHasContentChange,
  onVoiceAvailabilityChange,
  competition = false,
}: {
  adventureId?: string | null
  onHasContentChange?: (hasContent: boolean) => void
  onVoiceAvailabilityChange?: (available: boolean) => void
  /**
   * Whiteboard-app mode (the Econ Coach shell): compact bottom controls, and
   * boards never adopt orphaned ink from other scopes, because every board is
   * created explicitly and starts blank.
   */
  competition?: boolean
} = {}) {
  const rf = useReactFlow()
  const { x, y, zoom } = useViewport()
  const apiKey = useStore((s) => s.apiKey)
  const adventures = useStore((s) => s.adventures)
  const adventuresRef = useRef(adventures)
  useEffect(() => void (adventuresRef.current = adventures), [adventures])

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const questionInputRef = useRef<HTMLInputElement | null>(null)
  const spaceMoveRef = useRef(false)
  const panGestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    viewport: { x: number; y: number; zoom: number }
  } | null>(null)
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>())
  const touchGestureRef = useRef<{
    pointerIds: [number, number]
    startDistance: number
    startZoom: number
    flowAnchor: { x: number; y: number }
  } | null>(null)
  const touchSuppressedRef = useRef(false)

  const [tool, setTool] = useState<Tool>('pen')
  const [spaceMove, setSpaceMove] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [color, setColor] = useState(PEN_COLORS[0])
  const [size, setSize] = useState(PEN_SIZES[1])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [draft, setDraft] = useState<Stroke | null>(null)
  const draftRef = useRef<Stroke | null>(null)
  useEffect(() => void (draftRef.current = draft), [draft])
  const [images, setImages] = useState<ImgEl[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [cards, setCards] = useState<HintCard[]>([])
  const worksheetCardIdRef = useRef<string | null>(null)
  const worksheetReadSeqRef = useRef(0)
  const [hintSize, setHintSize] = useState<1 | 2 | 4>(2)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [prompt, setPrompt] = useState('')
  const [lessonContext, setLessonContext] = useState('')
  const pen = useTutorPen()
  const [acceptedStepCue, setAcceptedStepCue] = useState<{ id: number; x: number; y: number } | null>(null)
  const acceptedStepCueIdRef = useRef(0)
  const acceptedStepCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const acceptedPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [freshTutorStrokeIds, setFreshTutorStrokeIds] = useState<ReadonlySet<string>>(new Set())
  const tutorPenBusyRef = useRef(false)
  const tutorStrokeBaselineRef = useRef<ReadonlySet<string>>(new Set())
  const freshTutorInkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (pen.busy && !tutorPenBusyRef.current) {
      tutorStrokeBaselineRef.current = new Set(pen.strokes.map((stroke) => stroke.id))
    } else if (!pen.busy && tutorPenBusyRef.current) {
      const baseline = tutorStrokeBaselineRef.current
      const freshIds = new Set(
        pen.strokes.filter((stroke) => !baseline.has(stroke.id)).map((stroke) => stroke.id)
      )
      if (freshTutorInkTimerRef.current) clearTimeout(freshTutorInkTimerRef.current)
      setFreshTutorStrokeIds(freshIds)
      freshTutorInkTimerRef.current = setTimeout(() => {
        freshTutorInkTimerRef.current = null
        setFreshTutorStrokeIds(new Set())
      }, 600)
    }
    tutorPenBusyRef.current = pen.busy
  }, [pen.busy, pen.strokes])
  useEffect(
    () => () => {
      if (acceptedStepCueTimerRef.current) clearTimeout(acceptedStepCueTimerRef.current)
      if (acceptedPulseTimerRef.current) clearTimeout(acceptedPulseTimerRef.current)
      if (freshTutorInkTimerRef.current) clearTimeout(freshTutorInkTimerRef.current)
    },
    []
  )
  const togetherSessionRef = useRef<TogetherSession | null>(null)
  const pendingTogetherRef = useRef<(() => void) | null>(null)
  const exitTogetherRef = useRef<() => void>(() => {})
  const [togetherStep, setTogetherStep] = useState<number | null>(null)
  const [lessonOverrideId, setLessonOverrideId] = useState<string | null>(null)
  const [lessonMenuOpen, setLessonMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)
  const [hubOffline, setHubOffline] = useState(false)
  const [localServices, setLocalServices] = useState({
    bonsai: false,
    argmax: false,
    graphChecker: false,
  })
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const statusPopoverRef = useRef<HTMLDivElement>(null)
  const tutorPenBoundsRef = useRef<BoardBounds[]>([])
  const equationDrawnCardIdsRef = useRef(new Set<string>())
  const drawnGraphKeysRef = useRef(new Set<string>())
  const [drawnGraphKeys, setDrawnGraphKeys] = useState<ReadonlySet<string>>(new Set())
  const clearTutorPen = useCallback(() => {
    exitTogetherRef.current()
    pen.clear()
    tutorPenBoundsRef.current = []
    equationDrawnCardIdsRef.current.clear()
    drawnGraphKeysRef.current.clear()
    setDrawnGraphKeys(new Set())
  }, [pen.clear])

  // ── Live handwriting recognition (local Bonsai vision, via the API server) ──
  // Debounced off every stroke mutation (draw, erase, undo, clear). The result
  // maps each recognized line to the stroke IDs that drew it, which is what
  // powers "line n" hint highlighting. Reading a line takes seconds on a CPU,
  // so the server may answer with some lines still pending; ask again until
  // every line has been read (finished lines are cached server-side).
  const [inkModel, setInkModel] = useState<InkModel>({ lines: [] })
  const inkModelRef = useRef(inkModel)
  const detectedLesson = pickTogetherLesson(
    [
      lessonContext,
      prompt,
      ...inkModel.lines.filter((line) => !line.graph).map((line) => line.latex),
    ].join('\n')
  )
  const selectedLesson =
    (lessonOverrideId
      ? TOGETHER_LESSONS.find((lesson) => lesson.id === lessonOverrideId)
      : undefined) ?? detectedLesson
  useEffect(() => void (inkModelRef.current = inkModel), [inkModel])
  const [recognitionOverrides, setRecognitionOverrides] = useState<Record<string, string>>({})
  const recognitionOverridesRef = useRef(recognitionOverrides)
  useEffect(() => void (recognitionOverridesRef.current = recognitionOverrides), [recognitionOverrides])
  const [editingRecognitionKey, setEditingRecognitionKey] = useState<string | null>(null)
  const [editingRecognitionText, setEditingRecognitionText] = useState('')
  const saveRecognitionOverride = useCallback((key: string, text: string) => {
    const next = { ...recognitionOverridesRef.current }
    if (text.trim()) next[key] = text.trim()
    else delete next[key]
    recognitionOverridesRef.current = next
    setRecognitionOverrides(next)
    setEditingRecognitionKey(null)
  }, [])
  const [glowStrokeIds, setGlowStrokeIds] = useState<ReadonlySet<string>>(new Set())
  const recognitionOffRef = useRef(false) // set when the server has no recognizer
  const recognitionSeqRef = useRef(0)

  useEffect(() => {
    if (recognitionOffRef.current) return
    const seq = ++recognitionSeqRef.current
    if (strokes.length === 0) {
      setInkModel({ lines: [] })
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const run = () => {
      timer = null
      attempts++
      void recognizeInk(strokes.map((s) => ({ id: s.id, points: s.points })))
        .then((model) => {
          if (recognitionSeqRef.current !== seq) return
          setInkModel((prev) => carryGraphVerdicts(prev, model))
          // Some lines are still unread (model busy with a hint, or starting up).
          if (model.pending && attempts < 12) timer = setTimeout(run, 4000)
        })
        .catch((err) => {
          if (err instanceof RecognitionUnavailableError) recognitionOffRef.current = true
          // Transient failures are non-fatal: hints still work from the images.
        })
    }
    // Longer pause than a cloud recognizer needs: each read costs CPU seconds,
    // so wait until the student has clearly stopped writing.
    timer = setTimeout(run, 1500)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [strokes])

  useEffect(() => {
    const lessonBox = togetherSessionRef.current?.box
    for (const line of inkModel.lines) {
      if (lessonBox && overlapsTogetherBox(line.bounds, lessonBox)) continue
      const graph = line.graph
      if (!graph || graph.status !== 'mistake') continue
      const key = `${[...line.strokeIds].sort().join(',')}|${graph.mistake ?? ''}`
      if (drawnGraphKeysRef.current.has(key)) continue
      const ops = graphCorrectionOps(graph, line.strokeIds, strokesRef.current)
      if (ops.length === 0) continue
      drawnGraphKeysRef.current.add(key)
      setDrawnGraphKeys(new Set(drawnGraphKeysRef.current))
      pen.enqueue(ops)
    }
  }, [inkModel.lines, pen.enqueue, strokes, togetherStep])

  /**
   * Glow the strokes behind the given recognized line numbers. Stays lit
   * until the NEXT highlight call replaces it (or the board changes under
   * it) — no auto fade-out, so it doesn't disappear mid-conversation while
   * you're still looking at it.
   */
  const highlightRecognizedLines = useCallback((lineNumbers: number[]) => {
    const ids = new Set<string>()
    for (const n of lineNumbers) {
      const line = inkModelRef.current.lines.find((l) => l.n === n)
      if (line) for (const id of line.strokeIds) ids.add(id)
    }
    if (ids.size === 0) return
    setGlowStrokeIds(ids)
  }, [])

  const rememberTutorPenBounds = useCallback((ops: PenOp[]) => {
    let bounds: BoardBounds | null = null
    const add = (r: BoardBounds) => {
      bounds = bounds ? unionBounds(bounds, r) : r
    }
    for (const op of ops) {
      if (op.kind === 'stroke') {
        for (const point of op.stroke.points) {
          const pad = op.stroke.width / 2
          add({ minX: point.x - pad, minY: point.y - pad, maxX: point.x + pad, maxY: point.y + pad })
        }
      } else {
        add({
          minX: op.label.x,
          minY: op.label.y - op.label.size,
          maxX: op.label.x + op.label.text.length * op.label.size * 0.65,
          maxY: op.label.y,
        })
      }
    }
    if (bounds) tutorPenBoundsRef.current.push(bounds)
    return bounds
  }, [])

  const placeTutorContent = useCallback(
    (w: number, h: number, fitViewport = true) => {
      let content: BoardBounds | null = null
      const add = (r: BoardBounds) => {
        content = content ? unionBounds(content, r) : r
      }
      for (const stroke of strokesRef.current) {
        const pad = stroke.width / 2
        for (const point of stroke.points) {
          add({
            minX: point.x - pad,
            minY: point.y - pad,
            maxX: point.x + pad,
            maxY: point.y + pad,
          })
        }
      }
      for (const image of imagesRef.current) {
        add({ minX: image.x, minY: image.y, maxX: image.x + image.w, maxY: image.y + image.h })
      }
      for (const drawing of tutorPenBoundsRef.current) add(drawing)
      const pane = overlayRef.current?.getBoundingClientRect()
      if (pane) {
        for (const chip of document.querySelectorAll<HTMLElement>('.math-ocr-read-chip')) {
          const rect = chip.getBoundingClientRect()
          const topLeft = rf.screenToFlowPosition({ x: rect.left, y: rect.top })
          const bottomRight = rf.screenToFlowPosition({ x: rect.right, y: rect.bottom })
          add({
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y,
          })
        }
      }

      const contentBounds = content as BoardBounds | null
      let x: number
      let y: number
      if (contentBounds) {
        x = contentBounds.maxX + 160
        y = contentBounds.minY
      } else if (pane) {
        const center = rf.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
        x = center.x - w / 2
        y = center.y - h / 2
      } else {
        x = 0
        y = 0
      }

      if (pane && fitViewport) {
        const tl = rf.flowToScreenPosition({ x, y })
        const br = rf.flowToScreenPosition({ x: x + w, y: y + h })
        const visible =
          tl.x >= pane.left + 8 && tl.y >= pane.top + 96 && br.x <= pane.right - 8 && br.y <= pane.bottom - 70
        if (!window.matchMedia('(max-width: 600px)').matches) {
          const viewport = rf.getViewport()
          const frameCenter = rf.flowToScreenPosition({ x: x + w / 2, y: y + h / 2 })
          const targetCenter = { x: pane.left + pane.width * 0.36, y: pane.top + pane.height * 0.46 }
          void rf.setViewport(
            {
              x: viewport.x + targetCenter.x - frameCenter.x,
              y: viewport.y + targetCenter.y - frameCenter.y,
              zoom: viewport.zoom,
            },
            { duration: 450 }
          )
        } else if (!visible) {
          const minX = Math.min(contentBounds?.minX ?? x, x)
          const minY = Math.min(contentBounds?.minY ?? y, y)
          const maxX = x + w
          const maxY = Math.max(contentBounds?.maxY ?? y + h, y + h)
          rf.fitBounds(
            { x: minX - 40, y: minY - 150, width: maxX - minX + 80, height: maxY - minY + 260 },
            { duration: 450 }
          )
        }
      }
      return { x, y, w, h }
    },
    [rf]
  )

  const fitMobileLessonFrame = useCallback(
    async (box: TogetherBox, lesson: TogetherLesson) => {
      if (!window.matchMedia('(max-width: 600px)').matches) return
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const pane = overlayRef.current?.getBoundingClientRect()
      if (!pane) return
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        return element && getComputedStyle(element).display !== 'none'
          ? element.getBoundingClientRect()
          : null
      }
      const toolbar = toolbarRef.current?.getBoundingClientRect()
      const tutorCard = rect('.math-tutor-presence')
      const top = Math.max(
        pane.top,
        rect('.econ-float')?.bottom ?? pane.top,
        rect('.math-local-status')?.bottom ?? pane.top,
        rect('.math-hub-offline')?.bottom ?? pane.top
      ) + 12
      const bottom = Math.min(
        pane.bottom,
        toolbar?.top ?? pane.bottom - 96,
        tutorCard?.top ?? pane.bottom - 230
      ) - 12
      const yLabelWidth = lesson.yLabel.length * 15 * 0.65
      const xLabelWidth = lesson.xLabel.length * 15 * 0.65
      const bounds = {
        minX: box.x - yLabelWidth - 12,
        maxX: box.x + box.w + xLabelWidth + 16,
        minY: box.y - 16,
        maxY: box.y + box.h + 36,
      }
      const contentWidth = bounds.maxX - bounds.minX
      const contentHeight = bounds.maxY - bounds.minY
      const availableWidth = Math.max(120, pane.width - 24)
      const availableHeight = Math.max(120, bottom - top)
      const zoom = Math.max(
        0.35,
        Math.min(
          1.1,
          availableWidth / contentWidth,
          availableHeight / contentHeight
        )
      )
      const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
      const centerX = pane.left + pane.width / 2
      const centerY = (top + bottom) / 2
      return rf.setViewport(
        {
          x: centerX - pane.left - center.x * zoom,
          y: centerY - pane.top - center.y * zoom,
          zoom,
        },
        { duration: 220 }
      )
    },
    [rf]
  )

  const drawOnBoard = useCallback(
    (spec: TutorGraphSpec) => {
      const box = placeTutorContent(380, 320)
      const ops = specToPenOps(spec, box)
      rememberTutorPenBounds(ops)
      pen.enqueue(ops)
    },
    [pen.enqueue, placeTutorContent, rememberTutorPenBounds]
  )

  const writeEquationsOnBoard = useCallback(
    (cardId: string, equations: string[]) => {
      if (equationDrawnCardIdsRef.current.has(cardId)) return
      const lines = equations.map(equationToBoardText).filter(Boolean)
      if (lines.length === 0) return
      const width = Math.max(380, Math.min(900, Math.max(...lines.map((line) => line.length * 10 + 24))))
      const box = placeTutorContent(width, lines.length * 30 + 20, false)
      const id = uid()
      const ops: PenOp[] = lines.map((text, index) => ({
        kind: 'label',
        label: {
          id: `${id}-equation-${index}`,
          x: box.x,
          y: box.y + 24 + index * 30,
          text,
          color: '#2563eb',
          size: 18,
        },
      }))
      equationDrawnCardIdsRef.current.add(cardId)
      rememberTutorPenBounds(ops)
      pen.enqueue(ops)
    },
    [pen.enqueue, placeTutorContent, rememberTutorPenBounds]
  )

  /** Numbered LaTeX transcript for the hint request (lines the recognizer could label). */
  const recognizedLinesPayload = useCallback(
    () =>
      inkModelRef.current.lines
        .filter((l) => !!l.latex)
        .map((l) => ({
          n: l.n,
          latex: recognitionOverridesRef.current[recognitionOverrideKey(l.strokeIds)] ?? (l.latex as string),
        })),
    []
  )

  const [ttsOK, setTtsOK] = useState(false)
  const hintSpeakerRef = useRef<IncrementalSpeaker | null>(null)
  const speakerRef = useRef<IncrementalSpeaker | null>(null)
  const [hintSpeakingId, setHintSpeakingId] = useState<string | null>(null)
  const [speakerOn, setSpeakerOn] = useState(true)

  useEffect(() => {
    let active = true
    const refreshServices = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (!response.ok) throw new Error('Hub health check failed')
        const health = (await response.json()) as {
          bonsai?: { reachable?: boolean }
          graphChecker?: { state?: string }
          stt?: string | { ready?: boolean; reachable?: boolean }
        }
        let argmax = health.stt === 'argmax' || health.stt === 'ready' || health.stt === 'on'
        try {
          const voiceResponse = await fetch('/api/econ/voice/status', { cache: 'no-store' })
          if (voiceResponse.ok) {
            const voice = (await voiceResponse.json()) as {
              stt?: string
              ready?: boolean
              reachable?: boolean
            }
            argmax =
              argmax ||
              voice.ready === true ||
              voice.reachable === true ||
              voice.stt === 'argmax' ||
              voice.stt === 'ready' ||
              voice.stt === 'on'
          }
        } catch {
          // The health endpoint still indicates whether the rest of the hub is available.
        }
        if (!active) return
        setHubOffline(false)
        setLocalServices({
          bonsai: health.bonsai?.reachable === true,
          argmax,
          graphChecker: health.graphChecker?.state === 'ready',
        })
      } catch {
        if (!active) return
        setHubOffline(true)
        setLocalServices({ bonsai: false, argmax: false, graphChecker: false })
      }
    }
    void refreshServices()
    const timer = window.setInterval(() => void refreshServices(), 15000)
    const onOffline = () => {
      setHubOffline(true)
      setLocalServices({ bonsai: false, argmax: false, graphChecker: false })
    }
    const onOnline = () => void refreshServices()
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    if (!moreMenuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [moreMenuOpen])

  useEffect(() => {
    if (!statusPopoverOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!statusPopoverRef.current?.contains(event.target as Node)) setStatusPopoverOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [statusPopoverOpen])

  // Wait for the workspace store to hydrate before touching board storage —
  // pre-hydration the app runs with a throwaway default adventure id, and
  // loading/saving under it stole or clobbered the real board on every boot.
  // The Econ Coach shell has its own auth and boards — skip the workspace gate there.
  const [storeHydrated, setStoreHydrated] = useState(
    () => competition || useStore.persist.hasHydrated()
  )
  useEffect(() => {
    if (competition || storeHydrated) return
    const unsub = useStore.persist.onFinishHydration(() => setStoreHydrated(true))
    return unsub
  }, [competition, storeHydrated])

  const boardHydratedRef = useRef(false)
  const boardAdventureRef = useRef<string | null>(null)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const promptRef = useRef(prompt)
  useEffect(() => void (promptRef.current = prompt), [prompt])
  const lessonContextRef = useRef(lessonContext)
  useEffect(() => void (lessonContextRef.current = lessonContext), [lessonContext])

  const flushBoardPersist = useCallback((adventureOverride?: string) => {
    const id = adventureOverride ?? boardAdventureRef.current
    if (!id || !boardHydratedRef.current) return
    const strokes = strokesRef.current
    const images = imagesRef.current
    const promptValue = promptRef.current
    const savedLessonContext = lessonContextRef.current
    const savedRecognitionOverrides = recognitionOverridesRef.current
    // StrictMode / remount races can flush empty refs right after restore and
    // upload that empty snapshot to the cloud — wiping real work on refresh.
    // Skip empty flushes when storage still has ink (intentional Clear ink
    // calls clearMathBoard first, so this guard won't block a real clear).
    if (
      strokes.length === 0 &&
      images.length === 0 &&
      !promptValue?.trim() &&
      !savedLessonContext?.trim()
    ) {
      const existing = loadMathBoard(id, [], { adoptOrphans: false })
      if (
        existing &&
        (existing.strokes.length > 0 ||
          existing.images.length > 0 ||
          existing.prompt ||
          existing.lessonContext)
      ) {
        return
      }
    }
    saveMathBoard(id, {
      strokes,
      images,
      prompt: promptValue,
      lessonContext: savedLessonContext,
      recognitionOverrides: savedRecognitionOverrides,
    })
  }, [])

  // ── Restore whiteboard ink per adventure ──
  useEffect(() => {
    const boardReady = competition || storeHydrated
    if (!adventureId || !boardReady) return
    clearTutorPen()
    boardHydratedRef.current = false
    boardAdventureRef.current = adventureId

    const snap = loadMathBoard(
      adventureId,
      adventuresRef.current.map((a) => a.id),
      { adoptOrphans: !competition }
    )
    if (snap) {
      setStrokes(snap.strokes)
      setImages(snap.images)
      setPrompt(snap.prompt ?? '')
      setLessonContext(snap.lessonContext ?? snap.prompt ?? '')
      setRecognitionOverrides(snap.recognitionOverrides ?? {})
      recognitionOverridesRef.current = snap.recognitionOverrides ?? {}
      // Sync the persist refs NOW, not on next render — otherwise an immediate
      // unmount (StrictMode remount, fast adventure switch, dev reload) flushes
      // the stale empty refs back over the snapshot we just loaded = data loss.
      strokesRef.current = snap.strokes
      imagesRef.current = snap.images
      promptRef.current = snap.prompt ?? ''
      lessonContextRef.current = snap.lessonContext ?? snap.prompt ?? ''
      setSelectedImageId(null)
      setCards([])
      setDraft(null)
      if (snap.strokes.length > 0 || snap.images.length > 0) {
        hasAttempt.current = true
        setPhase('working')
      } else {
        hasAttempt.current = false
        setPhase('awaiting_problem')
      }
    } else {
      setStrokes([])
      setImages([])
      setPrompt('')
      setLessonContext('')
      setRecognitionOverrides({})
      recognitionOverridesRef.current = {}
      strokesRef.current = []
      imagesRef.current = []
      promptRef.current = ''
      lessonContextRef.current = ''
      setSelectedImageId(null)
      setCards([])
      setDraft(null)
      hasAttempt.current = false
      setPhase('awaiting_problem')
    }
    past.current = []
    future.current = []
    setHistTick((t) => t + 1)
    // Defer "hydrated" so the strokes=[] → strokesRef sync effect in THIS
    // commit can't run with hydrated=true and wipe the refs we just restored.
    const aid = adventureId
    queueMicrotask(() => {
      if (boardAdventureRef.current === aid) boardHydratedRef.current = true
    })

    return () => {
      // Force a flush on unmount even if the microtask hasn't flipped hydrated.
      boardHydratedRef.current = true
      flushBoardPersist(adventureId)
      boardHydratedRef.current = false
    }
  }, [adventureId, storeHydrated, competition, flushBoardPersist, clearTutorPen])

  useEffect(() => {
    if (!adventureId || !boardHydratedRef.current) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      if (boardAdventureRef.current === adventureId) flushBoardPersist()
    }, 600)
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [adventureId, strokes, images, prompt, lessonContext, recognitionOverrides, flushBoardPersist])

  useEffect(() => {
    const onUnload = () => flushBoardPersist()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushBoardPersist()
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onHide)
      flushBoardPersist()
    }
  }, [flushBoardPersist])

  // ── Tutoring session (problem → work → stuck → consent → hint → response) ──
  const [phase, setPhase] = useState<SessionPhase>('awaiting_problem')
  const phaseRef = useRef(phase)
  useEffect(() => void (phaseRef.current = phase), [phase])
  const lastActivity = useRef(Date.now())
  const stuckFired = useRef(false)
  const hasAttempt = useRef(false) // has the student drawn since the problem was set?

  /** Mark the moment a problem enters the board — starts the "watch" clock. */
  const markProblemSet = useCallback(() => {
    if (phaseRef.current !== 'awaiting_problem') return
    lastActivity.current = Date.now()
    stuckFired.current = false
    setPhase('working')
  }, [])

  /** Any drawing/erasing counts as progress — resets the stuck timer. */
  const noteActivity = useCallback(() => {
    lastActivity.current = Date.now()
    stuckFired.current = false
    hasAttempt.current = true
    const p = phaseRef.current
    if (p === 'awaiting_problem') markProblemSet()
    else if (p === 'stuck_prompt') setPhase('working')
  }, [markProblemSet])

  // Tell the host the moment there's any drawing/content so the empty state can hide.
  const hasContent =
    strokes.length > 0 ||
    images.length > 0 ||
    pen.strokes.length > 0 ||
    pen.labels.length > 0 ||
    cards.length > 0 ||
    !!draft
  useEffect(() => {
    onHasContentChange?.(hasContent)
  }, [hasContent, onHasContentChange])

  // Stuck auto-prompt removed — student requests hints explicitly via toolbar or Adam card.

  const drawing = useRef(false)
  const selStart = useRef<{ x: number; y: number } | null>(null)
  const selRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const toolRef = useRef(tool)
  useEffect(() => void (toolRef.current = tool), [tool])
  useEffect(() => {
    if (tool !== 'off') setSelectedImageId(null)
  }, [tool])

  // ── Undo / redo history (strokes + images) ──
  const strokesRef = useRef(strokes)
  const imagesRef = useRef(images)
  const cardsRef = useRef(cards)
  // Only mirror state → refs after restore has committed. The restore effect
  // writes refs directly; copying the initial [] here used to clobber them.
  useEffect(() => {
    if (!boardHydratedRef.current) return
    strokesRef.current = strokes
  }, [strokes])
  useEffect(() => {
    if (!boardHydratedRef.current) return
    imagesRef.current = images
  }, [images])
  useEffect(() => void (cardsRef.current = cards), [cards])
  const past = useRef<{ strokes: Stroke[]; images: ImgEl[] }[]>([])
  const future = useRef<{ strokes: Stroke[]; images: ImgEl[] }[]>([])
  const erasePushed = useRef(false)
  const imgGestureRef = useRef<{
    kind: 'drag' | 'resize'
    id: string
    startFlow: { x: number; y: number }
    startIm: ImgEl
  } | null>(null)
  const [, setHistTick] = useState(0) // re-render so toolbar enabled-state updates

  const snapshot = () => ({ strokes: strokesRef.current, images: imagesRef.current })
  const pushHistory = useCallback((snap?: { strokes: Stroke[]; images: ImgEl[] }) => {
    past.current.push(snap ?? snapshot())
    if (past.current.length > 60) past.current.shift()
    future.current = []
    setHistTick((t) => t + 1)
  }, [])

  const undo = useCallback(() => {
    if (past.current.length === 0) return
    future.current.push(snapshot())
    const prev = past.current.pop()!
    setStrokes(prev.strokes)
    setImages(prev.images)
    setHistTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    if (future.current.length === 0) return
    past.current.push(snapshot())
    const next = future.current.pop()!
    setStrokes(next.strokes)
    setImages(next.images)
    setHistTick((t) => t + 1)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      if (e.code === 'Space') {
        e.preventDefault()
        if (!spaceMoveRef.current) {
          spaceMoveRef.current = true
          setSpaceMove(true)
        }
        return
      }

      if (e.key === 'Escape') {
        setSelectedImageId(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedImageId) return
        e.preventDefault()
        pushHistory()
        setImages((prev) => prev.filter((im) => im.id !== selectedImageId))
        setSelectedImageId(null)
        return
      }

      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceMoveRef.current = false
      setSpaceMove(false)
    }
    const onBlur = () => {
      spaceMoveRef.current = false
      setSpaceMove(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [undo, redo, selectedImageId, pushHistory])

  const paneRect = () => overlayRef.current?.getBoundingClientRect() ?? null
  const getViewportFlowBounds = useCallback((): TogetherViewport | undefined => {
    const pane = overlayRef.current?.getBoundingClientRect()
    if (!pane) return undefined
    const topLeft = rf.screenToFlowPosition({ x: pane.left + 8, y: pane.top + 8 })
    const bottomRight = rf.screenToFlowPosition({ x: pane.right - 8, y: pane.bottom - 8 })
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y,
    }
  }, [rf])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const viewport = rf.getViewport()
      const rect = overlay.getBoundingClientRect()
      const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const dx = e.deltaX * multiplier
      const dy = e.deltaY * multiplier
      if (e.ctrlKey) {
        const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const nextZoom = Math.max(0.15, Math.min(2, viewport.zoom * Math.exp(-dy * 0.0015)))
        const flowPoint = {
          x: (point.x - viewport.x) / viewport.zoom,
          y: (point.y - viewport.y) / viewport.zoom,
        }
        void rf.setViewport(
          {
            x: point.x - flowPoint.x * nextZoom,
            y: point.y - flowPoint.y * nextZoom,
            zoom: nextZoom,
          },
          { duration: 0 }
        )
      } else {
        void rf.setViewport(
          { x: viewport.x - dx, y: viewport.y - dy, zoom: viewport.zoom },
          { duration: 0 }
        )
      }
    }
    overlay.addEventListener('wheel', handleWheel, { passive: false })
    return () => overlay.removeEventListener('wheel', handleWheel)
  }, [rf])

  // Fixed UI chrome the hint card must never cover: the top toolbar, the
  // bottom mic/voice bar, and React Flow's own zoom controls + minimap.
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const micBarRef = useRef<HTMLElement | null>(null)
  const [chromeRects, setChromeRects] = useState<ScreenRect[]>([])
  const savedToolbarDock = readToolbarDock()
  const [toolbarDock, setToolbarDock] = useState<ToolbarDock>(() => savedToolbarDock.dock)
  const [toolbarFree, setToolbarFree] = useState(() => savedToolbarDock.free)
  const [toolbarDragging, setToolbarDragging] = useState(false)
  const [toolbarSnapping, setToolbarSnapping] = useState(false)
  const [toolbarSnapDock, setToolbarSnapDock] = useState<ToolbarDock | null>(null)
  const [showGestureHint, setShowGestureHint] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('econcoach-board-gesture-hint-v1') !== '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!showGestureHint) return
    try {
      window.localStorage.setItem('econcoach-board-gesture-hint-v1', '1')
    } catch {
      /* local storage may be unavailable */
    }
    const timer = window.setTimeout(() => setShowGestureHint(false), 9000)
    return () => window.clearTimeout(timer)
  }, [showGestureHint])
  // Freeze side/top layout for the whole drag so the bar doesn't reshape
  // under the cursor the moment you grab it.
  const [toolbarDragVertical, setToolbarDragVertical] = useState(false)
  const toolbarDragOffset = useRef({ x: 0, y: 0 })
  const toolbarFreeRef = useRef(toolbarFree)
  const toolbarGhostRef = useRef<HTMLDivElement | null>(null)
  const toolbarDraggingRef = useRef(false)
  const toolbarPaneOrigin = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const toolbarGrabClient = useRef<{ x: number; y: number } | null>(null)
  const toolbarFlipFirst = useRef<DOMRect | null>(null)
  /** Real measured footprints for each orientation — ghost previews the target, not a rotate of the live bar. */
  const toolbarOrientSize = useRef<{ horizontal: ToolbarSize | null; vertical: ToolbarSize | null }>({
    horizontal: null,
    vertical: null,
  })
  useEffect(() => {
    toolbarFreeRef.current = toolbarFree
  }, [toolbarFree])

  // Keep both orientation sizes fresh whenever the bar is settled.
  useLayoutEffect(() => {
    if (toolbarDragging || toolbarSnapping) return
    const el = toolbarRef.current
    if (!el) return
    const vertical = toolbarDock === 'left' || toolbarDock === 'right'
    const live = { w: el.offsetWidth, h: el.offsetHeight }
    if (live.w < 8 || live.h < 8) return
    if (vertical) toolbarOrientSize.current.vertical = live
    else toolbarOrientSize.current.horizontal = live

    const missing = vertical ? 'horizontal' : 'vertical'
    if (!toolbarOrientSize.current[missing]) {
      toolbarOrientSize.current[missing] = measureToolbarOrientation(el, missing === 'vertical')
    }
  }, [toolbarDock, toolbarDragging, toolbarSnapping, competition])

  // After React applies is-dragging (and drops dock transforms), put the
  // grab point back under the cursor so the bar never "slips" on pickup.
  useLayoutEffect(() => {
    if (!toolbarDragging) return
    const grab = toolbarGrabClient.current
    const el = toolbarRef.current
    if (!grab || !el) return
    const origin = toolbarPaneOrigin.current
    const next = {
      x: grab.x - origin.left - toolbarDragOffset.current.x,
      y: grab.y - origin.top - toolbarDragOffset.current.y,
    }
    toolbarFreeRef.current = next
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.right = 'auto'
    el.style.bottom = 'auto'
    el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
  }, [toolbarDragging, toolbarDragVertical])

  // FLIP into the final dock: layout commits first, then we invert+play so
  // the bar morphs into place (including horizontal ↔ vertical) without a pop.
  useLayoutEffect(() => {
    if (!toolbarSnapping) return
    const el = toolbarRef.current
    const first = toolbarFlipFirst.current
    if (!el || !first) {
      setToolbarSnapping(false)
      return
    }

    el.style.transition = 'none'
    el.style.left = ''
    el.style.top = ''
    el.style.right = ''
    el.style.bottom = ''
    el.style.transform = ''
    el.style.transformOrigin = '0 0'

    const last = el.getBoundingClientRect()
    const dx = first.left - last.left
    const dy = first.top - last.top
    const firstVertical = first.height > first.width * 1.15
    const lastVertical = last.height > last.width * 1.15
    const orientChange = firstVertical !== lastVertical
    const sx = orientChange ? first.width / Math.max(last.width, 1) : 1
    const sy = orientChange ? first.height / Math.max(last.height, 1) : 1

    // Skip tiny moves — already home.
    if (Math.hypot(dx, dy) < 1.5 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) {
      toolbarFlipFirst.current = null
      el.style.transformOrigin = ''
      el.style.pointerEvents = ''
      el.style.willChange = ''
      setToolbarSnapping(false)
      return
    }

    const from =
      orientChange
        ? `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`
        : `translate3d(${dx}px, ${dy}px, 0)`
    const to = orientChange ? 'translate3d(0,0,0) scale(1)' : 'translate3d(0,0,0)'
    el.style.transform = from

    let done = false
    let timeoutId = 0
    let raf1 = 0
    let raf2 = 0
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(timeoutId)
      el.removeEventListener('transitionend', onEnd)
      el.style.transition = ''
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.pointerEvents = ''
      el.style.willChange = ''
      toolbarFlipFirst.current = null
      setToolbarSnapping(false)
    }
    const onEnd = (te: TransitionEvent) => {
      if (te.propertyName && te.propertyName !== 'transform') return
      finish()
    }

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        el.style.transition = `transform ${TOOLBAR_FLIP_MS}ms ${TOOLBAR_FLIP_EASE}`
        el.style.transform = to
        el.addEventListener('transitionend', onEnd)
        timeoutId = window.setTimeout(finish, TOOLBAR_FLIP_MS + 80)
      })
    })

    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      window.clearTimeout(timeoutId)
      el.removeEventListener('transitionend', onEnd)
    }
  }, [toolbarSnapping, toolbarDock])

  useLayoutEffect(() => {
    const update = () => {
      // Skip during drag/snap — measuring mid-motion causes jank.
      if (toolbarDraggingRef.current || toolbarSnapping) return
      const wrap = paneRect()
      if (!wrap) {
        setChromeRects([])
        return
      }
      const rects: ScreenRect[] = []
      const add = (el: Element | null | undefined) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        rects.push({ left: r.left - wrap.left, top: r.top - wrap.top, right: r.right - wrap.left, bottom: r.bottom - wrap.top })
      }
      add(toolbarRef.current)
      add(micBarRef.current)
      const flowRoot = overlayRef.current?.closest('.react-flow')
      add(flowRoot?.querySelector('.react-flow__controls') ?? null)
      add(flowRoot?.querySelector('.react-flow__minimap') ?? null)
      // The app's own corner controls (logo + board picker, Saved pill + avatar):
      // tutor cards must not land on top of them either.
      add(document.querySelector('.econ-float-left'))
      add(document.querySelector('.econ-float-right'))
      setChromeRects(rects)
    }
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (toolbarRef.current) ro?.observe(toolbarRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [x, y, zoom, competition, toolbarDock, toolbarFree, toolbarDragging, toolbarSnapping])

  // ── Pointer handling ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      const touchPointers = touchPointersRef.current
      touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touchPointers.size >= 2) {
        e.preventDefault()
        e.stopPropagation()
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* some browsers do not expose pointer capture for touch */
        }
        if (!touchGestureRef.current) {
          const pointerIds = [...touchPointers.keys()].slice(0, 2) as [number, number]
          const first = touchPointers.get(pointerIds[0])!
          const second = touchPointers.get(pointerIds[1])!
          const midX = (first.x + second.x) / 2
          const midY = (first.y + second.y) / 2
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
          touchGestureRef.current = {
            pointerIds,
            startDistance: distance,
            startZoom: rf.getViewport().zoom,
            flowAnchor: rf.screenToFlowPosition({ x: midX, y: midY }),
          }
        }
        touchSuppressedRef.current = true
        if (drawing.current && toolRef.current === 'pen') {
          if (past.current.length > 0) past.current.pop()
          setHistTick((tick) => tick + 1)
        }
        drawing.current = false
        draftRef.current = null
        setDraft(null)
        selStart.current = null
        selRef.current = null
        setSel(null)
        setIsPanning(true)
        return
      }
    }
    if (e.button === 1 || (e.button === 0 && spaceMoveRef.current)) {
      e.preventDefault()
      e.stopPropagation()
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* some pointer sources do not expose capture */
      }
      panGestureRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        viewport: rf.getViewport(),
      }
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    const t = toolRef.current
    if (t === 'off') return
    e.preventDefault()
    try {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      /* some pointer sources (e.g. simulated pens) have no capturable id */
    }

    if (t === 'highlight') {
      const r = paneRect()
      if (!r) return
      selStart.current = { x: e.clientX - r.left, y: e.clientY - r.top }
      const rect0 = { x: selStart.current.x, y: selStart.current.y, w: 0, h: 0 }
      selRef.current = rect0
      setSel(rect0)
      return
    }

    if (t === 'eraser') {
      drawing.current = true
      erasePushed.current = false
      noteActivity()
      eraseAt(e.clientX, e.clientY)
      return
    }

    // pen — record the pre-stroke state so this stroke can be undone
    drawing.current = true
    pushHistory()
    noteActivity()
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const pt: InkPoint = { ...pos, t: Date.now(), p: e.pressure > 0 ? e.pressure : undefined }
    setDraft({ id: uid(), color, width: size / zoom, points: [pt] })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const gesture = touchGestureRef.current
      if (gesture) {
        const first = touchPointersRef.current.get(gesture.pointerIds[0])
        const second = touchPointersRef.current.get(gesture.pointerIds[1])
        const pane = paneRect()
        if (!first || !second || !pane) return
        const midX = (first.x + second.x) / 2 - pane.left
        const midY = (first.y + second.y) / 2 - pane.top
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        const nextZoom = Math.max(0.35, Math.min(2.5, gesture.startZoom * (distance / gesture.startDistance)))
        void rf.setViewport(
          {
            x: midX - gesture.flowAnchor.x * nextZoom,
            y: midY - gesture.flowAnchor.y * nextZoom,
            zoom: nextZoom,
          },
          { duration: 0 }
        )
        return
      }
      if (touchSuppressedRef.current) return
    }
    const pan = panGestureRef.current
    if (pan?.pointerId === e.pointerId) {
      void rf.setViewport(
        {
          x: pan.viewport.x + e.clientX - pan.startX,
          y: pan.viewport.y + e.clientY - pan.startY,
          zoom: pan.viewport.zoom,
        },
        { duration: 0 }
      )
      return
    }
    const t = toolRef.current
    if (t === 'highlight') {
      if (!selStart.current) return
      const r = paneRect()
      if (!r) return
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      const s = selStart.current
      const rect = {
        x: Math.min(s.x, cx),
        y: Math.min(s.y, cy),
        w: Math.abs(cx - s.x),
        h: Math.abs(cy - s.y),
      }
      selRef.current = rect
      setSel(rect)
      return
    }

    if (!drawing.current) return
    if (t === 'eraser') {
      eraseAt(e.clientX, e.clientY)
      return
    }

    // pen
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const pt: InkPoint = { ...pos, t: Date.now(), p: e.pressure > 0 ? e.pressure : undefined }
    setDraft((d) => (d ? { ...d, points: [...d.points, pt] } : d))
  }

  const onPointerUp = (e?: React.PointerEvent) => {
    if (e && (e.type === 'pointerup' || e.type === 'pointercancel') && e.pointerType === 'touch') {
      const wasSuppressed = touchSuppressedRef.current
      touchPointersRef.current.delete(e.pointerId)
      if (touchGestureRef.current && touchPointersRef.current.size < 2) {
        touchGestureRef.current = null
        setIsPanning(false)
      }
      if (wasSuppressed) {
        if (touchPointersRef.current.size === 0) touchSuppressedRef.current = false
        return
      }
      if (e.type === 'pointercancel' && drawing.current && toolRef.current === 'pen') {
        if (past.current.length > 0) past.current.pop()
        setHistTick((tick) => tick + 1)
        draftRef.current = null
        setDraft(null)
        drawing.current = false
        return
      }
    }
    const pan = panGestureRef.current
    if (pan && (!e || pan.pointerId === e.pointerId)) {
      panGestureRef.current = null
      setIsPanning(false)
      return
    }
    const t = toolRef.current
    if (t === 'highlight') {
      const rect = selRef.current
      selStart.current = null
      selRef.current = null
      if (rect && rect.w > 12 && rect.h > 12) void createHintFromRect(rect)
      setSel(null)
      return
    }
    if (drawing.current && t === 'pen') {
      const d = draftRef.current
      if (d && d.points.length > 0) {
        setStrokes((s) => [...s, d])
        noteStrokeForWriteZones(d)
      }
      setDraft(null)
    }
    if (drawing.current) noteActivity() // restart the "stuck" clock once they lift the pen
    drawing.current = false
  }

  const eraseAt = (clientX: number, clientY: number) => {
    const p = rf.screenToFlowPosition({ x: clientX, y: clientY })
    const threshold = 14 / zoom
    const curStrokes = strokesRef.current
    const curImages = imagesRef.current

    const hitImage = curImages.find((im) => imageHit(p, im))
    const nextImages = hitImage ? curImages.filter((im) => im.id !== hitImage.id) : curImages
    const nextStrokes = curStrokes.filter((st) => !strokeHit(p, st, threshold))

    if (nextImages.length === curImages.length && nextStrokes.length === curStrokes.length) return

    if (!erasePushed.current) {
      erasePushed.current = true
      pushHistory({ strokes: curStrokes, images: curImages })
    }
    if (hitImage && selectedImageId === hitImage.id) setSelectedImageId(null)
    if (nextImages !== curImages) setImages(nextImages)
    if (nextStrokes !== curStrokes) setStrokes(nextStrokes)
  }

  const onImagePointerDown = (e: React.PointerEvent, im: ImgEl, kind: 'drag' | 'resize') => {
    if (toolRef.current !== 'off') return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelectedImageId(im.id)
    const startFlow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    imgGestureRef.current = { kind, id: im.id, startFlow, startIm: { ...im } }
    if (kind === 'drag') pushHistory()
    if (kind === 'resize') pushHistory()
  }

  const onImagePointerMove = (e: React.PointerEvent) => {
    const g = imgGestureRef.current
    if (!g) return
    const cur = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const dx = cur.x - g.startFlow.x
    const dy = cur.y - g.startFlow.y
    setImages((prev) =>
      prev.map((im) => {
        if (im.id !== g.id) return im
        if (g.kind === 'drag') {
          return { ...im, x: g.startIm.x + dx, y: g.startIm.y + dy }
        }
        return {
          ...im,
          w: Math.max(40, g.startIm.w + dx),
          h: Math.max(40, g.startIm.h + dy),
        }
      })
    )
  }

  const onImagePointerUp = () => {
    imgGestureRef.current = null
  }

  // ── Paste / upload images (placed at viewport center, in flow coords) ──
  const placeImage = useCallback(
    (src: string) => {
      const img = new Image()
      img.onload = () => {
        const r = overlayRef.current?.getBoundingClientRect()
        // Slightly below the vertical middle so the pasted problem never lands
        // hidden behind the floating toolbar at the top of the board.
        const center = rf.screenToFlowPosition({
          x: (r?.left ?? 0) + (r?.width ?? 800) / 2,
          y: (r?.top ?? 0) + (r?.height ?? 600) * 0.58,
        })
        const maxW = 520
        const scale = Math.min(maxW / img.width, 1)
        const w = img.width * scale
        const h = img.height * scale
        pushHistory()
        const id = uid()
        setImages((prev) => [
          ...prev,
          { id, src, x: center.x - w / 2, y: center.y - h / 2, w, h },
        ])
        setSelectedImageId(id)
        setTool('off')
        markProblemSet()
      }
      img.src = src
    },
    [rf, pushHistory, markProblemSet]
  )

  const readWorksheetImage = useCallback(async (image: string) => {
    const id = uid()
    const request = ++worksheetReadSeqRef.current
    const previousId = worksheetCardIdRef.current
    worksheetCardIdRef.current = id
    const readingCard: HintCard = {
      id,
      anchor: { x: 0, y: 0 },
      text: '',
      status: 'loading',
      history: [],
      followup: '',
      mode: 'voice',
      level: 2,
      tracked: false,
      firedMarkers: 0,
      writeStates: {},
      writeBoxes: {},
      steps: [],
      revealedSteps: 1,
      reexplainCounts: {},
    }
    setCards((current) => [...current.filter((card) => card.id !== previousId), readingCard])

    try {
      const response = await fetch('/api/econ/problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })
      if (!response.ok) throw new Error('Worksheet recognition failed')
      const result = (await response.json()) as { text?: unknown }
      const text = typeof result.text === 'string' ? result.text.trim() : ''
      if (!text) throw new Error('No worksheet text recognized')
      if (worksheetReadSeqRef.current !== request) return

      const lesson = pickTogetherLesson(text)
      const excerpt = text.replace(/\s+/g, ' ').slice(0, 110)
      lessonContextRef.current = text
      setLessonContext(text)
      setLessonOverrideId(lesson.id)
      setCards((current) =>
        current.map((card) =>
          card.id === id
            ? {
                ...card,
                text: `I read your worksheet: “${excerpt}${text.length > 110 ? '…' : ''}” This looks like a ${lesson.title.toLowerCase()} problem. Want to draw it together?`,
                status: 'done',
                suggestedLesson: { id: lesson.id, title: lesson.title },
              }
            : card
        )
      )
    } catch {
      if (worksheetReadSeqRef.current !== request) return
      setCards((current) =>
        current.map((card) =>
          card.id === id
            ? {
                ...card,
                status: 'error',
                error: 'I could not read this worksheet. You can still choose a lesson with Draw with Adam.',
              }
            : card
        )
      )
    }
  }, [])

  const placeImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const image = String(reader.result)
        placeImage(image)
        void readWorksheetImage(image)
      }
      reader.readAsDataURL(file)
    },
    [placeImage, readWorksheetImage]
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            placeImageFile(file)
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    const onPlaceImage = (event: Event) => {
      const file = (event as CustomEvent<File>).detail
      if (file instanceof File) placeImageFile(file)
    }
    const onFocusQuestion = () => {
      const input = questionInputRef.current ?? document.querySelector<HTMLInputElement>(
        'input[placeholder="Ask Adam a question about this problem"]'
      )
      if (input) input.focus()
      else document.querySelector<HTMLButtonElement>('.math-mic-bar button')?.focus()
    }
    window.addEventListener('econ:place-image', onPlaceImage)
    window.addEventListener('econ:focus-question', onFocusQuestion)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('econ:place-image', onPlaceImage)
      window.removeEventListener('econ:focus-question', onFocusQuestion)
    }
  }, [placeImageFile])

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    placeImageFile(file)
    e.target.value = ''
  }

  // ── Capture a pane region as PNG ──
  // Ink and pasted images are composited manually (always reliable). The
  // exploration nodes/background are added best-effort via html2canvas, which
  // can throw on some CSS — if it does, we simply fall back to a clean canvas so
  // capturing NEVER fails.
  const captureRegion = async (rect: {
    x: number
    y: number
    w: number
    h: number
  }): Promise<{ region: string; board?: string }> => {
    const wrapRect = overlayRef.current!.getBoundingClientRect()
    const PX = 2.5 // output pixel density — higher = sharper handwriting for OCR

    // Best-effort node/background layer.
    let full: HTMLCanvasElement | null = null
    try {
      const paneEl = overlayRef.current!.closest('.react-flow') as HTMLElement
      const { default: html2canvas } = await import('html2canvas')
      full = await html2canvas(paneEl, {
        backgroundColor: CAPTURE_BG,
        scale: PX,
        useCORS: true,
        logging: false,
        ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore'),
      })
    } catch {
      full = null // fall back to a clean white board
    }
    const s = full ? full.width / wrapRect.width : PX

    const toCrop = (flowX: number, flowY: number, offX: number, offY: number, pxScale: number) => {
      const sp = rf.flowToScreenPosition({ x: flowX, y: flowY })
      return {
        x: (sp.x - wrapRect.left - offX) * pxScale,
        y: (sp.y - wrapRect.top - offY) * pxScale,
      }
    }

    const paintContent = (
      ctx: CanvasRenderingContext2D,
      offX: number,
      offY: number,
      pxScale: number
    ) => {
      // Pasted / uploaded images (from live DOM elements — same-origin data URLs)
      for (const im of images) {
        const el = document.querySelector<HTMLImageElement>(`img[data-mathimg="${im.id}"]`)
        if (!el || !el.complete) continue
        const tl = toCrop(im.x, im.y, offX, offY, pxScale)
        const br = toCrop(im.x + im.w, im.y + im.h, offX, offY, pxScale)
        try {
          ctx.drawImage(el, tl.x, tl.y, br.x - tl.x, br.y - tl.y)
        } catch {
          /* ignore a single bad image */
        }
      }
      // Ink
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const st of strokes) {
        if (st.points.length === 0) continue
        ctx.strokeStyle = st.color
        ctx.lineWidth = Math.max(1, st.width * zoom * pxScale)
        ctx.beginPath()
        st.points.forEach((pt, i) => {
          const c = toCrop(pt.x, pt.y, offX, offY, pxScale)
          if (i === 0) ctx.moveTo(c.x, c.y)
          else ctx.lineTo(c.x, c.y)
        })
        ctx.stroke()
      }
    }

    // Region crop
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(rect.w * s))
    out.height = Math.max(1, Math.round(rect.h * s))
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
    if (full) octx.drawImage(full, rect.x * s, rect.y * s, rect.w * s, rect.h * s, 0, 0, out.width, out.height)
    paintContent(octx, rect.x, rect.y, s)
    const region = out.toDataURL('image/png')

    // Whole-board context (downscaled) — optional
    let board: string | undefined
    try {
      const fullW = full ? full.width : Math.round(wrapRect.width * s)
      const fullH = full ? full.height : Math.round(wrapRect.height * s)
      const bScale = Math.min(1, 2000 / fullW)
      const bcanvas = document.createElement('canvas')
      bcanvas.width = Math.round(fullW * bScale)
      bcanvas.height = Math.round(fullH * bScale)
      const bctx = bcanvas.getContext('2d')!
      bctx.fillStyle = CAPTURE_BG
      bctx.fillRect(0, 0, bcanvas.width, bcanvas.height)
      if (full) bctx.drawImage(full, 0, 0, bcanvas.width, bcanvas.height)
      paintContent(bctx, 0, 0, s * bScale)
      board = bcanvas.toDataURL('image/jpeg', 0.82)
    } catch {
      /* board context is optional */
    }

    return { region, board }
  }

  const paneFlowBounds = useCallback((): BoardBounds | null => {
    const el = overlayRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const tl = rf.screenToFlowPosition({ x: r.left, y: r.top })
    const br = rf.screenToFlowPosition({ x: r.right, y: r.bottom })
    return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y }
  }, [rf])

  /**
   * Bounds of the main work (pasted problem + primary ink cluster), with a
   * small bottom margin for the write box. Stray strokes far below an earlier
   * misplaced box are ignored so the grid / viewport stay tight.
   */
  const workBounds = useCallback((): BoardBounds => {
    let b: BoardBounds | null = mainInkBounds(strokesRef.current)
    for (const im of imagesRef.current) {
      const ib = { minX: im.x, minY: im.y, maxX: im.x + im.w, maxY: im.y + im.h }
      b = b ? unionBounds(b, ib) : ib
    }
    if (!b) return paneFlowBounds() ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    const pad = Math.max(40, Math.min(w, h) * 0.06)
    return {
      minX: b.minX - pad,
      minY: b.minY - pad,
      maxX: b.maxX + pad,
      maxY: b.maxY + Math.max(140, Math.min(200, h * 0.22)),
    }
  }, [paneFlowBounds])

  /**
   * Render the board (pasted images + ink, straight from vector points so
   * handwriting is always crisp regardless of viewport/zoom) onto a canvas
   * spanning `bounds`, optionally overlaid with a labeled 0–1000 coordinate
   * grid the model uses to visually pick highlight boxes.
   */
  const renderWorkImage = useCallback(
    (bounds: BoardBounds, opts: { grid: boolean }): string | undefined => {
      const w = bounds.maxX - bounds.minX
      const h = bounds.maxY - bounds.minY
      if (!(w > 0) || !(h > 0)) return undefined
      const TARGET = 1568 // long-edge cap; the server downsizes further for the local model
      const scale = Math.min(TARGET / w, TARGET / h, 4)
      const cw = Math.max(320, Math.round(w * scale))
      const ch = Math.max(320, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) return undefined
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, cw, ch)

      const fx = (x: number) => ((x - bounds.minX) / w) * cw
      const fy = (y: number) => ((y - bounds.minY) / h) * ch

      for (const im of imagesRef.current) {
        const el = document.querySelector<HTMLImageElement>(`img[data-mathimg="${im.id}"]`)
        if (!el || !el.complete) continue
        try {
          ctx.drawImage(el, fx(im.x), fy(im.y), (im.w / w) * cw, (im.h / h) * ch)
        } catch {
          /* skip a bad image */
        }
      }

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const st of strokesRef.current) {
        if (!st.points.length) continue
        ctx.strokeStyle = st.color
        ctx.lineWidth = Math.max(1.2, st.width * scale)
        ctx.beginPath()
        st.points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(fx(pt.x), fy(pt.y))
          else ctx.lineTo(fx(pt.x), fy(pt.y))
        })
        ctx.stroke()
      }

      if (opts.grid) {
        ctx.strokeStyle = 'rgba(37,99,235,0.20)'
        ctx.fillStyle = 'rgba(37,99,235,0.65)'
        ctx.lineWidth = 1
        ctx.font = `${Math.max(10, Math.round(cw / 120))}px sans-serif`
        for (let g = 0; g <= 1000; g += 100) {
          const x = (g / 1000) * cw
          const y = (g / 1000) * ch
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, ch)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(cw, y)
          ctx.stroke()
          if (g > 0 && g < 1000) {
            ctx.fillText(String(g), x + 3, 12)
            ctx.fillText(String(g), 3, y + 12)
          }
        }
      }

      return canvas.toDataURL('image/png')
    },
    []
  )

  /** Gridded work image + matching bounds — the model's targeting space. */
  const gridCapture = useCallback(() => {
    const bounds = workBounds()
    return { boardBounds: bounds, gridImage: renderWorkImage(bounds, { grid: true }) }
  }, [workBounds, renderWorkImage])

  /** Pasted problem screenshots, always sent raw so the problem is in context. */
  const problemImages = useCallback(
    () => imagesRef.current.slice(0, 3).map((im) => im.src),
    []
  )

  /** Zoom out to show all work on the board (used when the problem is complete). */
  const fitAllWork = useCallback(() => {
    const r = paneRect()
    if (!r) return
    const bounds = workBounds()
    const bw = bounds.maxX - bounds.minX
    const bh = bounds.maxY - bounds.minY
    if (!(bw > 0) || !(bh > 0)) return
    const pad = 0.12
    const zoomX = (r.width * (1 - pad * 2)) / bw
    const zoomY = (r.height * (1 - pad * 2)) / bh
    const targetZoom = Math.min(zoomX, zoomY, 1)
    rf.setCenter((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, {
      zoom: Math.max(0.35, targetZoom),
      duration: 800,
    })
  }, [rf, workBounds, paneRect])

  /** Pan down so a newly placed write box is fully in view. */
  const panToWriteBox = useCallback(
    (box: BoardBounds) => {
      const r = paneRect()
      if (!r) return
      const boxW = box.maxX - box.minX
      const boxH = box.maxY - box.minY
      const cx = (box.minX + box.maxX) / 2
      const cy = box.minY + boxH * 0.55
      const zoomX = (r.width * 0.84) / boxW
      const zoomY = (r.height * 0.58) / boxH
      const targetZoom = Math.min(Math.max(zoom, 0.78), zoomX, zoomY, 1.08)
      rf.setCenter(cx, cy, { zoom: targetZoom, duration: 560 })
    },
    [rf, zoom, paneRect]
  )

  // ── Hint requests ──
  const runHint = useCallback(
    (
      cardId: string,
      opts: {
        region?: string
        boardImage?: string
        prompt: string
        history: HintTurn[]
        mode: 'hint' | 'solve' | 'generalize'
        level: number
        maxLevel?: number
        tracked: boolean
        nudgeCount?: number
        /** Internal: one retry when a follow-up nudge omits the write box. */
        writeBoxRetry?: boolean
        /** Internal: one retry when the model streams back nothing visible. */
        emptyRetry?: boolean
      }
    ) => {
      const { boardBounds, gridImage } =
        opts.mode === 'hint' ? gridCapture() : { boardBounds: undefined, gridImage: undefined }

      // Follow-up nudges are always a single step (server-enforced too); a
      // fresh hint gets the tier's step cap (Small=1, Medium=2, Large=3).
      const followUpNudge = (opts.nudgeCount ?? 0) > 0
      const stepCap = followUpNudge ? 1 : maxStepsForLevel(opts.level)

      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                status: 'loading',
                text: '',
                equations: undefined,
                error: undefined,
                mode: opts.mode,
                level: opts.level,
                nudgeCount: opts.nudgeCount ?? c.nudgeCount ?? 0,
                responded: false,
                usedWriteBoxes: [
                  ...(c.usedWriteBoxes ?? []),
                  ...Object.values(c.writeBoxes ?? {}),
                  ...(c.heldZone ? [c.heldZone.box] : []),
                ],
                firedMarkers: 0,
                writeStates: {},
                writeBoxes: {},
                heldZone: undefined,
                regionFlow: undefined,
                complete: false,
                clarifications: [],
                boardBounds,
                steps: [],
                revealedSteps: 1,
                reexplainCounts: {},
                reexplaining: false,
              }
            : c
        )
      )
      if (opts.tracked) setPhase('hinting')

      if (opts.mode === 'hint') {
        cancelSpeech()
        speakerRef.current?.cancel()
        hintSpeakerRef.current?.cancel()
        setSpeakerOn(true)
        hintSpeakerRef.current = ttsOK
          ? new IncrementalSpeaker((on) => setHintSpeakingId(on ? cardId : null))
          : null
      } else {
        hintSpeakerRef.current?.cancel()
        setHintSpeakingId(null)
      }

      let acc = ''
      let parsedType: HintTypeId | undefined
      // Sentence-counted speech feed: every re-parse of the stream re-derives
      // the full spoken text, and we enqueue exactly the sentences that have
      // become complete since last time. Unlike the old string-prefix delta
      // (which silently DROPPED text whenever a marker/math span completing
      // changed earlier characters), this can never skip or reorder anything.
      let sentencesSpoken = 0
      const speakUpTo = (say: string, done: boolean) => {
        if (opts.mode !== 'hint' || !say) return
        const spoken = speakableNarration(say, done)
        const parts = spoken.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? []
        // The trailing part may still be mid-stream — hold it until done.
        const ready = done ? parts.length : Math.max(0, parts.length - 1)
        for (let i = sentencesSpoken; i < ready; i++) {
          hintSpeakerRef.current?.pushSentence(parts[i])
        }
        sentencesSpoken = Math.max(sentencesSpoken, ready)
      }
      void streamMathHint(
        {
          regionImage: opts.region,
          boardImage: opts.boardImage,
          gridImage,
          problemImages: problemImages(),
          recognizedLines: recognizedLinesPayload(),
          boardEmpty: strokesRef.current.length === 0 && imagesRef.current.length === 0,
          prompt: opts.prompt,
          history: opts.history,
          hintLevel: opts.level,
          mode: opts.mode,
          apiKey,
          onEquations: (equations) => {
            setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, equations } : c)))
            writeEquationsOnBoard(cardId, equations)
          },
        },
        (chunk) => {
          acc += chunk
          const parsed = opts.mode !== 'hint' ? null : parseHintResponse(acc)
          const type = parsed?.type
          if (type) parsedType = type
          // Cap to the tier's step count and only surface step 1 live — steps
          // 2/3 stream in behind the scenes and stay hidden until confirmed.
          const cappedSteps = opts.mode === 'hint' ? (parsed?.steps ?? []).slice(0, stepCap) : []
          const revealedText = opts.mode !== 'hint' ? '' : cappedSteps[0] ?? ''
          if (revealedText) speakUpTo(revealedText, false)
          setCards((cs) =>
            cs.map((c) =>
              c.id === cardId
                ? {
                    ...c,
                    status: 'streaming',
                    text: opts.mode !== 'hint' ? stripEmDashes(acc) : revealedText,
                    steps: opts.mode === 'hint' ? cappedSteps : c.steps,
                    strategy: parsed?.strategy,
                    step: parsed?.step,
                    hintType: type ?? c.hintType,
                  }
                : c
            )
          )
        },
        () => {
          const parsed = opts.mode !== 'hint' ? null : parseHintResponse(acc)
          const finalType = parsed?.type ?? parsedType
          const displayed = opts.mode !== 'hint' ? stripEmDashes(acc) : parsed?.hint ?? acc
          const cappedSteps = opts.mode === 'hint' ? (parsed?.steps ?? []).slice(0, stepCap) : []
          const cappedJoined = cappedSteps.join(' ')
          let revealedText = opts.mode !== 'hint' ? displayed : cappedSteps[0] ?? displayed

          // The card must NEVER finish blank. A "COMPLETE: yes" with no prose
          // gets a stock congratulation; anything else empty gets one silent
          // retry, then a visible error state the student can recover from.
          if (!revealedText.trim()) {
            if (parsed?.complete) {
              revealedText = 'Great work — this problem is fully solved!'
            } else if (!opts.emptyRetry) {
              // The usual cause: the internal WHERE block (quoting all their
              // notation before ever reaching STEP 1) ate the whole token
              // budget on a token-limited tier, so generation got cut off
              // before any visible text existed. Push the retry to spend
              // fewer tokens grounding itself so it actually reaches STEP 1.
              runHint(cardId, {
                ...opts,
                emptyRetry: true,
                prompt: `${opts.prompt} REMINDER: your last attempt cut off before writing anything visible. Keep WHERE to at most one short sentence total this time, then get straight to STEP 1 — a short STEP the student can see is far more important than a thorough WHERE block.`,
              })
              return
            } else {
              hintSpeakerRef.current?.cancel()
              setHintSpeakingId(null)
              setCards((cs) =>
                cs.map((c) =>
                  c.id === cardId
                    ? { ...c, status: 'error', error: 'The tutor sent an empty response. Please try again.' }
                    : c
                )
              )
              if (opts.tracked) setPhase('working')
              return
            }
          }
          if (opts.mode === 'hint') {
            speakUpTo(revealedText, true)
            hintSpeakerRef.current?.flush()
          }
          if (opts.tracked && opts.mode === 'hint' && !parsed?.complete) setPhase('working')
          if (parsed?.complete) {
            fitAllWork()
            setPhase('working')
          }
          // Every hint that isn't a full-solve confirmation MUST end with a
          // write box — that's the one thing the student always does next.
          // Check for a *parseable* [[write|box:…]] (not just the substring),
          // since truncated/malformed markers never draw a zone on the board.
          const missingWriteBox =
            opts.mode === 'hint' &&
            !parsed?.complete &&
            !hasWriteMarker(cappedJoined) &&
            !opts.writeBoxRetry
          if (missingWriteBox) {
            runHint(cardId, {
              ...opts,
              writeBoxRetry: true,
              prompt: `${opts.prompt} REMINDER: you MUST end your last STEP with exactly ONE literal [[write|box:x,y,w,h|label]] marker — saying "in the box" in prose is not enough and creates no box. State exactly what to write, then the marker. One concrete ask only (e.g. list the factor pairs) — do not skip ahead.`,
            })
            return
          }

          // Guarantee: the text the student sees RIGHT NOW (step 1) always
          // carries a write marker. Models often put the ask in STEP 1 prose
          // ("list the pairs… In the box, write…") but omit the marker, or
          // bury it on a later gated step the student hasn't revealed yet.
          let finalSteps = cappedSteps
          let finalText = revealedText
          if (opts.mode === 'hint' && !parsed?.complete) {
            const labelGuess =
              revealedText.match(
                /(?:in the box[,:]?\s*)?write\s+([\s\S]{0,80}?)(?:\s*[.!]|\s*\[\[|$)/i
              )?.[1]
                ?.replace(/\$+/g, '')
                .trim()
                .slice(0, 40) || 'your next line'
            if (!hasWriteMarker(finalText)) {
              finalText = ensureWriteMarker(finalText, labelGuess)
              // Keep a single write zone: strip any write markers that were
              // sitting on later gated steps so advancing doesn't spawn a second box.
              finalSteps = [
                finalText,
                ...finalSteps
                  .slice(1)
                  .map((s) => s.replace(/\[\[write\|[^\]]*\]\]/gi, '').replace(/\s+/g, ' ').trim())
                  .filter(Boolean),
              ]
            }
          }

          // Place the write box immediately when the hint lands — don't wait
          // for the typewriter to crawl to the trailing [[write|…]] marker.
          let earlyWriteBoxes: Record<number, BoardBounds> = {}
          let earlyFired = 0
          const textForBoard = opts.mode === 'hint' ? finalText : displayed
          if (opts.mode === 'hint' && !parsed?.complete && boardBounds && hasWriteMarker(textForBoard)) {
            const cardNow = cardsRef.current.find((c) => c.id === cardId)
            const occupied = cardOccupied(imagesRef.current, cardNow)
            const { markers } = parseNarration(textForBoard, true)
            earlyFired = markers.length
            const { writes } = resolveFiredMarkers(
              textForBoard,
              earlyFired,
              strokesRef.current,
              boardBounds,
              12,
              occupied,
              {}
            )
            for (const w of writes) earlyWriteBoxes[w.index] = w.box
            const latest = writes[writes.length - 1]
            if (latest) panToWriteBox(latest.box)
          }

          setCards((cs) =>
            cs.map((c) =>
              c.id === cardId
                ? {
                    ...c,
                    status: 'done',
                    text: textForBoard,
                    steps: opts.mode === 'hint' ? finalSteps : c.steps,
                    revealedSteps: 1,
                    strategy: parsed?.strategy,
                    step: parsed?.step,
                    hintType: finalType ?? c.hintType,
                    complete: parsed?.complete ?? false,
                    heldZone: c.heldZone ? { ...c.heldZone, state: 'done' } : undefined,
                    ...(earlyFired > 0
                      ? { firedMarkers: Math.max(c.firedMarkers, earlyFired), writeBoxes: earlyWriteBoxes }
                      : {}),
                    history: [
                      ...opts.history,
                      { role: 'user', content: opts.prompt },
                      { role: 'assistant', content: acc },
                    ],
                  }
                : c
            )
          )
        },
        (err) => {
          hintSpeakerRef.current?.cancel()
          setHintSpeakingId(null)
          setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, status: 'error', error: err } : c)))
          if (opts.tracked) setPhase('working')
        },
        (hl) => highlightRecognizedLines(hl.lines)
      )
    },
    [apiKey, ttsOK, gridCapture, problemImages, fitAllWork, recognizedLinesPayload, highlightRecognizedLines, panToWriteBox, writeEquationsOnBoard]
  )

  const createHintFromRect = useCallback(
    async (rect: { x: number; y: number; w: number; h: number }) => {
      const id = uid()
      const wrapRect = paneRect()
      if (!wrapRect) return
      const anchor = tutorAnchorFromRect(rect, rf, wrapRect)
      const regionFlow = screenRectToFlow(rect, rf, wrapRect)
      const userPrompt = prompt.trim() || DEFAULT_HINT_PROMPT

      if (phaseRef.current === 'awaiting_problem') markProblemSet()

      setCards(() => [
        // One Adam at a time: a new card replaces any that are open, so they never stack or cover each other.
        {
          id,
          anchor,
          regionFlow,
          text: '',
          status: 'loading',
          history: [],
          followup: '',
          mode: 'hint',
          level: hintSize,
          maxLevel: hintSize,
          tracked: true,
          nudgeCount: 0,
          firedMarkers: 0,
          writeStates: {},
          writeBoxes: {},
          steps: [],
          revealedSteps: 1,
          reexplainCounts: {},
        },
      ])

      try {
        const { region, board } = await captureRegion(rect)
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, region, boardImage: board } : c)))
        runHint(id, {
          region,
          boardImage: board,
          prompt: userPrompt,
          history: [],
          mode: 'hint',
          level: hintSize,
          maxLevel: hintSize,
          tracked: true,
          nudgeCount: 0,
        })
      } catch (err) {
        setCards((cs) =>
          cs.map((c) =>
            c.id === id
              ? { ...c, status: 'error', error: err instanceof Error ? err.message : 'Capture failed' }
              : c
          )
        )
      }
    },
    [prompt, runHint, markProblemSet, strokes, zoom, rf, hintSize]
  )
  const captureBoard = useCallback(async () => {
    const r = paneRect()
    if (!r) throw new Error('Whiteboard not ready')
    return captureRegion({ x: 0, y: 0, w: r.width, h: r.height })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, images, zoom])

  /**
   * Proactive, consented hint over the whole board at a given ladder rung.
   * Used by the "stuck → want a hint?" flow and its "still stuck" escalation.
   */
  const requestAutoHint = useCallback(
    async (level: number) => {
      const wrapRect = paneRect()
      if (!wrapRect) return
      const id = uid()
      const centroid = strokeCentroid(strokesRef.current)
      const anchor = centroid
        ? { x: centroid.x + 40, y: centroid.y + 50 }
        : rf.screenToFlowPosition({
            x: wrapRect.left + wrapRect.width * 0.35,
            y: wrapRect.top + wrapRect.height * 0.45,
          })
      const userPrompt =
        prompt.trim() ||
        `Re-read my latest work. Give a ${ladderTypeForLevel(level)} hint for my very next move from the equations I already wrote — not a new approach.`
      setCards(() => [
        // One Adam at a time: a new card replaces any that are open, so they never stack or cover each other.
        {
          id,
          anchor,
          text: '',
          status: 'loading',
          history: [],
          followup: '',
          mode: 'hint',
          level,
          maxLevel: level,
          nudgeCount: 0,
          tracked: true,
          firedMarkers: 0,
          writeStates: {},
          writeBoxes: {},
          steps: [],
          revealedSteps: 1,
          reexplainCounts: {},
        },
      ])
      try {
        const { region, board } = await captureBoard()
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, region: undefined, boardImage: board ?? region } : c)))
        runHint(id, { region: board ?? region, boardImage: board, prompt: userPrompt, history: [], mode: 'hint', level, tracked: true })
      } catch (err) {
        setCards((cs) =>
          cs.map((c) =>
            c.id === id
              ? { ...c, status: 'error', error: err instanceof Error ? err.message : 'Capture failed' }
              : c
          )
        )
        setPhase('working')
      }
    },
    [prompt, captureBoard, runHint, rf]
  )

  /** Toolbar hint — whole-board capture at the chosen hint size. */
  const requestBoardHint = useCallback(
    async (level: 1 | 2 | 4) => {
      if (strokesRef.current.length === 0 && imagesRef.current.length === 0) return
      const wrapRect = paneRect()
      if (!wrapRect) return
      const id = uid()
      const centroid = strokeCentroid(strokesRef.current)
      const anchor = centroid
        ? { x: centroid.x + 40, y: centroid.y + 50 }
        : rf.screenToFlowPosition({
            x: wrapRect.left + wrapRect.width * 0.72,
            y: wrapRect.top + wrapRect.height * 0.22,
          })
      const userPrompt =
        prompt.trim() ||
        `Read my work first: what strategy have I started and what step am I on? Then give ONE ${ladderTypeForLevel(level)} hint for my very next move from the equations I already wrote — not a shortcut from a different approach.`
      if (phaseRef.current === 'awaiting_problem') markProblemSet()
      setCards(() => [
        // One Adam at a time: a new card replaces any that are open, so they never stack or cover each other.
        {
          id,
          anchor,
          text: '',
          status: 'loading',
          history: [],
          followup: '',
          mode: 'hint',
          level,
          maxLevel: level,
          nudgeCount: 0,
          tracked: true,
          firedMarkers: 0,
          writeStates: {},
          writeBoxes: {},
          steps: [],
          revealedSteps: 1,
          reexplainCounts: {},
        },
      ])
      try {
        const { region, board } = await captureBoard()
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, region: undefined, boardImage: board ?? region } : c)))
        runHint(id, {
          region: board ?? region,
          boardImage: board,
          prompt: userPrompt,
          history: [],
          mode: 'hint',
          level,
          tracked: true,
        })
      } catch (err) {
        setCards((cs) =>
          cs.map((c) =>
            c.id === id
              ? { ...c, status: 'error', error: err instanceof Error ? err.message : 'Capture failed' }
              : c
          )
        )
      }
    },
    [prompt, captureBoard, runHint, rf, markProblemSet]
  )


  /**
   * "Generalize" — the tutor steps back from THIS problem and teaches the
   * general playbook for the whole problem TYPE ("generally, for problems like
   * this…"). Most valuable right after finishing a problem, but available any
   * time from the toolbar.
   */
  const requestGeneralize = useCallback(async () => {
    if (strokesRef.current.length === 0 && imagesRef.current.length === 0) return
    const wrapRect = paneRect()
    if (!wrapRect) return
    const id = uid()
    const anchor = rf.screenToFlowPosition({
      x: wrapRect.left + wrapRect.width * 0.5,
      y: wrapRect.top + wrapRect.height * 0.3,
    })
    setCards(() => [
      // One Adam at a time: a new card replaces any that are open, so they never stack or cover each other.
      {
        id,
        anchor,
        text: '',
        status: 'loading',
        history: [],
        followup: '',
        mode: 'generalize',
        level: 2,
        nudgeCount: 0,
        tracked: false,
        firedMarkers: 0,
        writeStates: {},
        writeBoxes: {},
        steps: [],
        revealedSteps: 1,
        reexplainCounts: {},
      },
    ])
    try {
      const { region, board } = await captureBoard()
      const boardImage = board ?? region
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, boardImage } : c)))
      runHint(id, {
        region: boardImage,
        boardImage,
        prompt:
          'I want the big picture now. Look at the problem I pasted and the work on my board, identify what TYPE of economics problem this is, and teach me the GENERAL approach for this whole family of problems — the way a coach debriefs after a solve.',
        history: [],
        mode: 'generalize',
        level: 2,
        tracked: false,
      })
    } catch (err) {
      setCards((cs) =>
        cs.map((c) =>
          c.id === id
            ? { ...c, status: 'error', error: err instanceof Error ? err.message : 'Capture failed' }
            : c
        )
      )
    }
  }, [captureBoard, runHint, rf])

  /** Re-capture the board so follow-up hints see the student's latest work. */
  const refreshCardCapture = useCallback(
    async (cardId: string, region?: string) => {
      try {
        if (region) {
          // Keep the original highlight if we have one — it's what the student asked about.
          const { board } = await captureBoard()
          setCards((cs) =>
            cs.map((c) => (c.id === cardId ? { ...c, region, boardImage: board } : c))
          )
          return { region, boardImage: board }
        }
        const { region: full, board } = await captureBoard()
        const boardImage = board ?? full
        setCards((cs) =>
          cs.map((c) => (c.id === cardId ? { ...c, region: undefined, boardImage } : c))
        )
        return { region: boardImage, boardImage }
      } catch {
        const card = cardsRef.current.find((c) => c.id === cardId)
        return { region: card?.region, boardImage: card?.boardImage }
      }
    },
    [captureBoard]
  )

  /**
   * The narration typewriter crossed a new inline marker — persist the count,
   * lock write-box positions, apply highlight/line glows, drop the yellow
   * selection highlight, and pan to any new write box.
   */
  const onMarkersFired = useCallback(
    (cardId: string, count: number) => {
      const card = cardsRef.current.find((c) => c.id === cardId)
      if (!card || count <= card.firedMarkers) return
      if (!card.boardBounds) {
        setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, firedMarkers: count } : c)))
        // Only glow lines whose [[highlight|...]] marker has actually been
        // typewriter-revealed so far — never the whole text's markers at once.
        const lines = extractHighlightLineNumbers(card.text, count)
        if (lines.length) highlightRecognizedLines(lines)
        return
      }
      const occupied = cardOccupied(imagesRef.current, card)
      const cached = card.writeBoxes ?? {}
      const { writes } = resolveFiredMarkers(
        card.text,
        count,
        strokesRef.current,
        card.boardBounds,
        12,
        occupied,
        cached
      )
      const writeBoxes = { ...cached }
      for (const w of writes) {
        if (!writeBoxes[w.index]) writeBoxes[w.index] = w.box
      }
      const hasWriteBox = writes.length > 0
      // Same rule: only markers revealed up to `count` so far can fire a glow.
      const lines = extractHighlightLineNumbers(card.text, count)
      if (lines.length) highlightRecognizedLines(lines)
      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                firedMarkers: count,
                writeBoxes,
                regionFlow: hasWriteBox ? undefined : c.regionFlow,
              }
            : c
        )
      )
      const latest = writes[writes.length - 1]
      if (!latest) return
      panToWriteBox(latest.box)
    },
    [panToWriteBox, highlightRecognizedLines]
  )

  // ── Write zones: the tutor circles blank space and asks for the next line ──
  // The student writes at their own pace; NOTHING is submitted until they tap
  // the check mark on the box. Then the camera hyperfocuses on the box, the
  // tutor reads exactly what's inside, and answers with a verdict.

  /** A committed pen stroke may have landed inside an open write zone. */
  const noteStrokeForWriteZones = useCallback((stroke: Stroke) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    if (!Number.isFinite(minX)) return

    for (const card of cardsRef.current) {
      if (card.mode !== 'hint' || !card.boardBounds || card.firedMarkers === 0) continue
      const occupied = cardOccupied(imagesRef.current, card)
      const { writes } = resolveFiredMarkers(
        card.text,
        card.firedMarkers,
        strokesRef.current,
        card.boardBounds,
        12,
        occupied,
        card.writeBoxes ?? {}
      )
      for (const wz of writes) {
        const state = card.writeStates[wz.index] ?? 'open'
        if (state !== 'open') continue
        const overlap =
          minX <= wz.box.maxX && maxX >= wz.box.minX && minY <= wz.box.maxY && maxY >= wz.box.minY
        if (!overlap) continue
        setCards((cs) =>
          cs.map((c) =>
            c.id === card.id
              ? { ...c, writeStates: { ...c.writeStates, [wz.index]: 'filled' } }
              : c
          )
        )
      }
    }
  }, [])

  /** Student tapped the ✓ on a write box — hyperfocus and have the tutor grade it. */
  const checkWriteZone = useCallback(
    (cardId: string, markerIndex: number) => {
      const card = cardsRef.current.find((c) => c.id === cardId)
      if (!card || !card.boardBounds || card.status === 'loading' || card.status === 'streaming') return
      const occupied = cardOccupied(imagesRef.current, card)
      const { writes } = resolveFiredMarkers(
        card.text,
        card.firedMarkers,
        strokesRef.current,
        card.boardBounds,
        12,
        occupied,
        card.writeBoxes ?? {}
      )
      const wz = writes.find((w) => w.index === markerIndex)
      if (!wz) return
      const label = wz.marker.label

      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                writeStates: { ...c.writeStates, [markerIndex]: 'checking' },
                heldZone: { box: wz.box, label, state: 'checking' },
              }
            : c
        )
      )

      // Bring the submitted box to center. Keep the zoom familiar (never a
      // hard zoom jump) — only nudge in slightly if they're zoomed way out.
      rf.setCenter((wz.box.minX + wz.box.maxX) / 2, (wz.box.minY + wz.box.maxY) / 2, {
        zoom: Math.min(1.15, Math.max(zoom, 0.85)),
        duration: 500,
      })

      // Crisp vector crop of JUST the box contents for the model to read.
      const pad = 30
      const zoneCrop = renderWorkImage(
        {
          minX: wz.box.minX - pad,
          minY: wz.box.minY - pad,
          maxX: wz.box.maxX + pad,
          maxY: wz.box.maxY + pad,
        },
        { grid: false }
      )

      runHint(cardId, {
        region: zoneCrop,
        prompt: `I tapped the check mark on the box you circled${
          label ? ` ("${label}")` : ''
        } — I'm done writing in it. The focus image is EXACTLY that box. Read what I wrote inside it character by character, then give your verdict following the WRITE-BOX CHECK rules.`,
        history: card.history,
        mode: 'hint',
        level: card.level,
        tracked: true,
      })
    },
    [rf, zoom, renderWorkImage, runHint]
  )

  const resolveCard = (card: HintCard, mode: 'hint' | 'solve') => {
    const nudgeCount = (card.nudgeCount ?? 0) + 1
    const level = card.level
    void (async () => {
      const cap =
        mode === 'hint' ? await refreshCardCapture(card.id) : { region: card.region, boardImage: card.boardImage }
      runHint(card.id, {
        region: cap.region,
        boardImage: cap.boardImage,
        prompt:
          mode === 'solve'
            ? 'Please show the full step-by-step solution and the final answer.'
            : `FOLLOW-UP NUDGE #${nudgeCount}: I already got your previous hint (see our conversation). Give me ONE slightly more revealing nudge from my current work — reveal a single new observation I have not used yet (for example one condition that must hold at equilibrium), then ask ONE question. Do NOT list cases, steps, or a full plan. Stay at ${ladderTypeForLevel(level)} level. Not the full solution. You MUST end STEP 1 with exactly ONE [[write|box:x,y,w,h|label]] in fresh blank space below my work — state explicitly what to write in it.`,
        history: card.history,
        mode,
        level,
        nudgeCount,
        tracked: mode === 'hint',
      })
    })()
  }

  /** Student tapped "Makes sense, next step" — reveal the next gated micro-step. */
  const advanceStep = useCallback((cardId: string) => {
    setCards((cs) =>
      cs.map((c) => {
        if (c.id !== cardId) return c
        const next = c.revealedSteps + 1
        if (next > c.steps.length) return c
        const added = c.steps[next - 1]
        if (added) speakStepAloud(hintSpeakerRef.current, added)
        return { ...c, revealedSteps: next, text: c.steps.slice(0, next).join(' ') }
      })
    )
  }, [])

  /**
   * Student tapped "I'm confused" on the currently-gating step — re-explain
   * ONLY that one step, differently, and swap it in place. Never touches the
   * steps already confirmed before it.
   */
  const reexplainStep = useCallback(
    (cardId: string) => {
      const card = cardsRef.current.find((c) => c.id === cardId)
      if (!card) return
      const stepIndex = card.revealedSteps - 1
      if (stepIndex < 0 || stepIndex >= card.steps.length) return
      const baseline = card.steps.slice(0, stepIndex)
      const attempts = card.reexplainCounts[stepIndex] ?? 0
      const confusingStep = card.steps[stepIndex]

      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                reexplaining: true,
                status: 'streaming',
                text: baseline.join(' '),
                firedMarkers: 0,
                writeStates: {},
                writeBoxes: {},
              }
            : c
        )
      )

      void (async () => {
        const cap = await refreshCardCapture(cardId, card.region)

        cancelSpeech()
        speakerRef.current?.cancel()
        hintSpeakerRef.current?.cancel()
        setSpeakerOn(true)
        hintSpeakerRef.current = ttsOK
          ? new IncrementalSpeaker((on) => setHintSpeakingId(on ? cardId : null))
          : null

        let acc = ''
        let sentencesSpoken = 0
        const speakUpTo = (say: string, done: boolean) => {
          if (!say) return
          const spoken = speakableNarration(say, done)
          const parts = spoken.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? []
          const ready = done ? parts.length : Math.max(0, parts.length - 1)
          for (let i = sentencesSpoken; i < ready; i++) {
            hintSpeakerRef.current?.pushSentence(parts[i])
          }
          sentencesSpoken = Math.max(sentencesSpoken, ready)
        }

        await streamMathHint(
          {
            regionImage: cap.region,
            boardImage: cap.boardImage,
            problemImages: problemImages(),
            boardEmpty: strokesRef.current.length === 0 && imagesRef.current.length === 0,
            prompt: `REEXPLAIN STEP: the student is confused by this part of your last hint: "${confusingStep}". Re-explain ONLY this one idea a different way, still just ONE short step. Do NOT include a write box marker.`,
            history: card.history,
            hintLevel: card.level,
            mode: 'hint',
            apiKey,
            onEquations: (equations) => {
              setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, equations } : c)))
              writeEquationsOnBoard(cardId, equations)
            },
          },
          (chunk) => {
            acc += chunk
            const parsed = parseHintResponse(acc)
            const stepText = parsed.steps[0] ?? parsed.hint ?? ''
            if (stepText) speakUpTo(stepText, false)
            setCards((cs) =>
              cs.map((c) => {
                if (c.id !== cardId) return c
                const newSteps = [...c.steps]
                newSteps[stepIndex] = stepText
                return { ...c, steps: newSteps, text: [...baseline, stepText].join(' ') }
              })
            )
          },
          () => {
            const parsed = parseHintResponse(acc)
            // Never blank: if the re-explanation came back empty, keep the
            // original step text instead of wiping it.
            const stepText = cleanTutorProse(parsed.steps[0] ?? parsed.hint ?? acc) || confusingStep
            speakUpTo(stepText, true)
            hintSpeakerRef.current?.flush()
            setCards((cs) =>
              cs.map((c) => {
                if (c.id !== cardId) return c
                const newSteps = [...c.steps]
                newSteps[stepIndex] = stepText
                return {
                  ...c,
                  status: 'done',
                  steps: newSteps,
                  text: [...baseline, stepText].join(' '),
                  reexplaining: false,
                  reexplainCounts: { ...c.reexplainCounts, [stepIndex]: attempts + 1 },
                }
              })
            )
          },
          (err) => {
            // Fall back to the original step text rather than stranding the
            // student on a dead-end error with no checkin buttons to recover.
            setCards((cs) =>
              cs.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      status: 'done',
                      text: [...baseline, confusingStep].join(' '),
                      reexplaining: false,
                      error: err,
                    }
                  : c
              )
            )
          },
          (hl) => highlightRecognizedLines(hl.lines)
        )
      })()
    },
    [apiKey, problemImages, refreshCardCapture, ttsOK, highlightRecognizedLines, writeEquationsOnBoard]
  )

  const runClarifyHint = useCallback(
    (cardId: string, question: string) => {
      // Guard against a second voice/clarify question landing while the
      // first is still streaming: both would share the SAME hintSpeakerRef,
      // and their pushSentence() calls read whatever it currently points to
      // at call time — so two concurrent streams interleave into one audio
      // queue, and the voice reads a scramble of both answers while each
      // bubble's own text stays correct. One clarify/voice turn at a time.
      // A new question interrupts the reply in progress (see streamMathHint) instead of being dropped.
      const card = cardsRef.current.find((c) => c.id === cardId)
      if (!card || !question.trim()) {
        return
      }
      voiceBusyRef.current = true
      const clarifyId = uid()
      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                clarifications: [
                  ...(c.clarifications ?? []),
                  { id: clarifyId, question: question.trim(), answer: '', status: 'loading' as const },
                ],
              }
            : c
        )
      )

      void (async () => {
        let boardImage = card.boardImage
        let gridImage: string | undefined
        try {
          const cap = await refreshCardCapture(cardId)
          boardImage = cap.boardImage ?? boardImage
          gridImage = gridCapture().gridImage
        } catch {
          /* optional */
        }

        cancelSpeech()
        speakerRef.current?.cancel()
        hintSpeakerRef.current?.cancel()
        setSpeakerOn(true)
        hintSpeakerRef.current = ttsOK
          ? new IncrementalSpeaker((on) => setHintSpeakingId(on ? cardId : null))
          : null

        let acc = ''
        let sentencesSpoken = 0
        const speakUpTo = (say: string, done: boolean) => {
          if (!say) return
          const spoken = speakableNarration(say, done)
          const parts = spoken.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? []
          const ready = done ? parts.length : Math.max(0, parts.length - 1)
          for (let i = sentencesSpoken; i < ready; i++) {
            hintSpeakerRef.current?.pushSentence(parts[i])
          }
          sentencesSpoken = Math.max(sentencesSpoken, ready)
        }

        await streamMathHint(
          {
            boardImage,
            gridImage,
            problemImages: problemImages(),
            recognizedLines: recognizedLinesPayload(),
            boardEmpty: strokesRef.current.length === 0 && imagesRef.current.length === 0,
            prompt: `Clarifying question about your last hint: ${question.trim()}`,
            history: card.history,
            hintLevel: card.level,
            mode: 'clarify',
            apiKey,
            onGraph: drawOnBoard,
            onEquations: (equations) => {
              setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, equations } : c)))
              writeEquationsOnBoard(cardId, equations)
            },
          },
          (chunk) => {
            acc += chunk
            const parsed = parseHintResponse(acc)
            const answer = cleanTutorProse(
              parsed.hint || acc.replace(/^SAY:\s*/i, '').trim()
            )
            const lines = extractHighlightLineNumbers(acc)
            if (lines.length) highlightRecognizedLines(lines)
            speakUpTo(answer, false)
            setCards((cs) =>
              cs.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      clarifications: (c.clarifications ?? []).map((cl) =>
                        cl.id === clarifyId ? { ...cl, answer, status: 'streaming' as const } : cl
                      ),
                    }
                  : c
              )
            )
          },
          () => {
            const parsed = parseHintResponse(acc)
            const answer =
              cleanTutorProse(parsed.hint || acc.replace(/^SAY:\s*/i, '').trim()) ||
              "I didn't get an answer through — please ask that again."
            const lines = extractHighlightLineNumbers(acc)
            if (lines.length) highlightRecognizedLines(lines)
            speakUpTo(answer, true)
            hintSpeakerRef.current?.flush()
            voiceBusyRef.current = false
            setCards((cs) =>
              cs.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      clarifications: (c.clarifications ?? []).map((cl) =>
                        cl.id === clarifyId ? { ...cl, answer, status: 'done' as const } : cl
                      ),
                    }
                  : c
              )
            )
          },
          (err) => {
            voiceBusyRef.current = false
            setCards((cs) =>
              cs.map((c) =>
                c.id === cardId
                  ? {
                      ...c,
                      clarifications: (c.clarifications ?? []).map((cl) =>
                        cl.id === clarifyId
                          ? { ...cl, answer: err, status: 'done' as const }
                          : cl
                      ),
                    }
                  : c
              )
            )
          },
          (hl) => highlightRecognizedLines(hl.lines)
        )
      })()
    },
    [apiKey, drawOnBoard, gridCapture, problemImages, refreshCardCapture, ttsOK, recognizedLinesPayload, highlightRecognizedLines, writeEquationsOnBoard]
  )

  const speakTogetherStep = useCallback(
    (id: string, text: string) => {
      if (!speakerOn || !ttsOK) return
      speakerRef.current?.cancel()
      const speaker = new IncrementalSpeaker((talking) =>
        setHintSpeakingId(talking ? id : null)
      )
      speakerRef.current = speaker
      speaker.pushSentence(text)
    },
    [speakerOn, ttsOK]
  )

  const updateTogetherCard = useCallback((id: string, step: number, text: string) => {
    setTogetherStep(step)
    const session = togetherSessionRef.current
    setCards((current) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              togetherStep: step,
              togetherTitle: session?.id === id ? session.lesson.title : card.togetherTitle,
              togetherTotal:
                session?.id === id ? session.lesson.steps.length : card.togetherTotal,
              text,
              status: 'done',
            }
          : card
      )
    )
  }, [])

  const endDrawWithAdam = useCallback(() => {
    const session = togetherSessionRef.current
    if (!session) return
    togetherSessionRef.current = null
    pendingTogetherRef.current = null
    setTogetherStep(null)
    setLessonMenuOpen(false)
    setCards((current) => current.filter((card) => card.id !== session.id))
    if (acceptedStepCueTimerRef.current) clearTimeout(acceptedStepCueTimerRef.current)
    if (acceptedPulseTimerRef.current) clearTimeout(acceptedPulseTimerRef.current)
    acceptedStepCueTimerRef.current = null
    acceptedPulseTimerRef.current = null
    setAcceptedStepCue(null)
    speakerRef.current?.cancel()
    speakerRef.current = null
    setHintSpeakingId(null)
  }, [])

  useEffect(() => {
    exitTogetherRef.current = endDrawWithAdam
  }, [endDrawWithAdam])

  const getTogetherObstacles = useCallback(
    (extra: Stroke[] = [], includeLabels = true): TogetherStroke[] => {
      const labels = includeLabels ? togetherSessionRef.current?.tutorLabels ?? [] : []
      return [
        ...strokesRef.current.map((stroke) => ({ points: stroke.points, width: stroke.width })),
        ...pen.strokes.map((stroke) => ({ points: stroke.points, width: stroke.width })),
        ...extra.map((stroke) => ({ points: stroke.points, width: stroke.width })),
        ...labels.map(tutorLabelObstacle),
      ]
    },
    [pen.strokes]
  )

  const reflowTogetherLabels = useCallback(
    (session: TogetherSession, extra: Stroke[] = []) => {
      const ink = getTogetherObstacles(extra, false)
      for (const label of session.tutorLabels) {
        const labelObstacles = session.tutorLabels
          .filter((other) => other.id !== label.id)
          .map(tutorLabelObstacle)
        const position = placeLabelAwayFromStrokes(
          { x: label.x, y: label.y },
          label.text,
          [...ink, ...labelObstacles],
          label.size,
          getViewportFlowBounds()
        )
        if (position.x === label.x && position.y === label.y) continue
        pen.remove([label.id])
        const op: PenOp = {
          kind: 'label',
          label: {
            id: label.id,
            x: position.x,
            y: position.y,
            text: label.text,
            color: label.color,
            size: label.size,
          },
        }
        label.id = pen.enqueue([op])[0]
        label.x = position.x
        label.y = position.y
        rememberTutorPenBounds([op])
      }
    },
    [
      getTogetherObstacles,
      getViewportFlowBounds,
      pen.enqueue,
      pen.remove,
      rememberTutorPenBounds,
    ]
  )

  const runTogetherOps = useCallback(
    (ops: PenOp[], after: () => void): { ids: string[]; bounds: BoardBounds | null } => {
      if (ops.length === 0) {
        after()
        return { ids: [], bounds: null }
      }
      const bounds = rememberTutorPenBounds(ops)
      pendingTogetherRef.current = after
      const ids = pen.enqueue(ops)
      const session = togetherSessionRef.current
      if (session) {
        ops.forEach((op, index) => {
          if (op.kind !== 'label') return
          session.tutorLabels.push({
            id: ids[index],
            text: op.label.text,
            x: op.label.x,
            y: op.label.y,
            color: op.label.color,
            size: op.label.size,
          })
        })
      }
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        pendingTogetherRef.current = null
        after()
      }
      return { ids, bounds }
    },
    [pen.enqueue, rememberTutorPenBounds]
  )

  const clearTogetherCorrectionInk = useCallback(
    (session: TogetherSession) => {
      const replacement = replaceCorrectionOpIds(session.correctionOpIds, [])
      if (replacement.remove.length) pen.remove(replacement.remove)
      const removedBounds = new Set(session.correctionBounds)
      tutorPenBoundsRef.current = tutorPenBoundsRef.current.filter((bounds) => !removedBounds.has(bounds))
      session.correctionOpIds = replacement.active
      session.correctionBounds = []
    },
    [pen.remove]
  )

  const showAcceptedStepFeedback = useCallback((sessionId: string, stroke: Stroke) => {
    const point = strokeCentroid([stroke])
    const id = ++acceptedStepCueIdRef.current
    if (point) setAcceptedStepCue({ id, ...point })
    setCards((current) =>
      current.map((card) => (card.id === sessionId ? { ...card, successPulse: true } : card))
    )
    if (acceptedStepCueTimerRef.current) clearTimeout(acceptedStepCueTimerRef.current)
    if (acceptedPulseTimerRef.current) clearTimeout(acceptedPulseTimerRef.current)
    acceptedStepCueTimerRef.current = setTimeout(() => {
      acceptedStepCueTimerRef.current = null
      setAcceptedStepCue((current) => (current?.id === id ? null : current))
    }, 680)
    acceptedPulseTimerRef.current = setTimeout(() => {
      acceptedPulseTimerRef.current = null
      setCards((current) =>
        current.map((card) => (card.id === sessionId ? { ...card, successPulse: false } : card))
      )
    }, 520)
  }, [])

  const beginTogetherStudentTurn = useCallback(
    (step: number) => {
      const session = togetherSessionRef.current
      const lessonStep = session?.lesson.steps[step - 1]
      if (!session || !lessonStep || lessonStep.who !== 'student') return
      const need: TogetherNeed | null =
        lessonStep.action === 'first'
          ? 'first'
          : lessonStep.action === 'second'
            ? 'second'
            : lessonStep.action === 'shift'
              ? 'shift'
              : lessonStep.action === 'ppf-frontier'
                ? 'ppf-frontier'
                : lessonStep.action === 'inside-point'
                  ? 'inside-point'
                  : lessonStep.action === 'outside-point'
                    ? 'outside-point'
                    : lessonStep.action === 'ppf-growth'
                      ? 'ppf-growth'
                      : null
      if (!need) return
      session.step = step
      session.awaiting = need
      session.baselineIds = new Set(strokesRef.current.map((stroke) => stroke.id))
      updateTogetherCard(session.id, step, lessonStep.say)
    },
    [updateTogetherCard]
  )

  const runTogetherAdamStep = useCallback(
    (step: number, ops: PenOp[], sayOverride?: string) => {
      const session = togetherSessionRef.current
      const lessonStep = session?.lesson.steps[step - 1]
      if (!session || !lessonStep) return
      const say = sayOverride ?? lessonStep.say
      session.step = step
      session.awaiting = null
      session.completed = false
      runTogetherOps(ops, () => {
        if (togetherSessionRef.current !== session) return
        updateTogetherCard(session.id, step, say)
        speakTogetherStep(session.id, say)
        if (step >= session.lesson.steps.length) {
          session.completed = true
          pen.hideCursor()
          return
        }
        if (session.lesson.steps[step]?.who === 'student') beginTogetherStudentTurn(step + 1)
      })
    },
    [beginTogetherStudentTurn, pen.hideCursor, runTogetherOps, speakTogetherStep, updateTogetherCard]
  )

  const handleTogetherStudentStroke = useCallback(
    (stroke: Stroke) => {
      const session = togetherSessionRef.current
      const need = session?.awaiting
      if (!session || !need) return
      session.awaiting = null
      reflowTogetherLabels(session, [stroke])
      const step = session.step
      let feedback = ''
      if (session.lesson.kind === 'market') {
        const curve =
          need === 'first'
            ? session.lesson.first
            : need === 'second'
              ? session.lesson.second
              : need === 'shift'
                ? session.lesson.shift.curve === 'first'
                  ? session.lesson.first
                  : session.lesson.second
                : null
        if (curve && !strokeFitsBox(stroke, session.box)) {
          feedback = 'Keep the curve mostly inside the graph and make it span at least a third of the width.'
        } else if (curve && !isValidCurveStroke(stroke, session.box, curve.slope)) {
          feedback = curve.wrongMsg
        } else if (need === 'shift') {
          const original =
            session.lesson.shift.curve === 'first' ? session.first : session.second
          if (
            original &&
            !isCurveShifted(original, stroke, session.lesson.shift.dir, session.box)
          ) {
            feedback = session.lesson.shift.wrongMsg
          }
        }
      } else if (need === 'ppf-frontier' && !isPpfCurve(stroke, session.box)) {
        feedback = session.lesson.wrongMessages.bowed
      } else if (
        need === 'inside-point' &&
        (!session.frontier ||
          !isPointRelativeToCurve(stroke, session.frontier, session.box, 'inside', zoom))
      ) {
        feedback = session.lesson.wrongMessages.inside
      } else if (
        need === 'outside-point' &&
        (!session.frontier ||
          !isPointRelativeToCurve(stroke, session.frontier, session.box, 'outside', zoom))
      ) {
        feedback = session.lesson.wrongMessages.outside
      } else if (
        need === 'ppf-growth' &&
        (!session.frontier || !isPpfGrowth(session.frontier, stroke, session.box))
      ) {
        feedback = session.lesson.wrongMessages.growth
      }

      if (feedback) {
        clearTogetherCorrectionInk(session)
        const strokeBounds = tutorStrokeBounds(stroke)
        const correction = runTogetherOps(strokeBounds ? circleOps(strokeBounds) : [], () => {
          if (togetherSessionRef.current !== session) return
          updateTogetherCard(session.id, step, feedback)
          speakTogetherStep(session.id, feedback)
          session.baselineIds = new Set(strokesRef.current.map((item) => item.id))
          session.awaiting = need
        })
        session.correctionOpIds = replaceCorrectionOpIds(
          session.correctionOpIds,
          correction.ids
        ).active
        if (correction.bounds) session.correctionBounds.push(correction.bounds)
        return
      }

      clearTogetherCorrectionInk(session)
      showAcceptedStepFeedback(session.id, stroke)
      if (session.lesson.kind === 'market') {
        if (need === 'first') {
          session.first = stroke
          runTogetherAdamStep(
            3,
            [
              tutorCurveLabel(
                stroke,
                session.lesson.first.label,
                getTogetherObstacles([stroke]),
                undefined,
                getViewportFlowBounds()
              ),
            ]
          )
          return
        }
        if (need === 'second') {
          session.second = stroke
          const equilibrium = curveEquilibrium(session.first?.points ?? null, stroke.points, session.box)
          session.equilibrium = equilibrium
          runTogetherAdamStep(5, [
            tutorCurveLabel(
              stroke,
              session.lesson.second.label,
              getTogetherObstacles([stroke]),
              undefined,
              getViewportFlowBounds()
            ),
            ...tutorEquilibriumOps(
              session.box,
              equilibrium,
              session.lesson.eqLabels.y,
              session.lesson.eqLabels.x,
              getTogetherObstacles([stroke]),
              undefined,
              getViewportFlowBounds()
            ),
          ])
          return
        }

        if (need === 'shift') {
          session.shifted = stroke
          const newEquilibrium =
            session.lesson.shift.curve === 'first'
              ? curveEquilibrium(stroke.points, session.second?.points ?? null, session.box)
              : curveEquilibrium(session.first?.points ?? null, stroke.points, session.box)
          const oldEquilibrium = session.equilibrium
          session.equilibrium = newEquilibrium
          runTogetherAdamStep(7, [
            tutorCurveLabel(
              stroke,
              session.lesson.shift.newLabel,
              getTogetherObstacles([stroke]),
              undefined,
              getViewportFlowBounds()
            ),
            ...(oldEquilibrium ? tutorArrowOps(oldEquilibrium, newEquilibrium) : []),
            ...tutorEquilibriumOps(
              session.box,
              newEquilibrium,
              shiftedEquilibriumLabel(session.lesson.eqLabels.y),
              shiftedEquilibriumLabel(session.lesson.eqLabels.x),
              getTogetherObstacles([stroke]),
              oldEquilibrium,
              getViewportFlowBounds()
            ),
          ])
        }
        return
      }

      if (need === 'ppf-frontier') {
        session.frontier = stroke
        const start = stroke.points[0]
        runTogetherAdamStep(
          3,
          [
            tutorCurveLabel(stroke, 'PPF', getTogetherObstacles([stroke]), {
              x: start.x + 4,
              y: start.y - 28,
            }, getViewportFlowBounds()),
          ]
        )
      } else if (need === 'inside-point') {
        session.insidePoint = stroke
        runTogetherAdamStep(
          5,
          [
            tutorCurveLabel(
              stroke,
              'A: inefficient',
              getTogetherObstacles([stroke]),
              undefined,
              getViewportFlowBounds()
            ),
          ]
        )
      } else if (need === 'outside-point') {
        session.outsidePoint = stroke
        runTogetherAdamStep(
          6,
          [
            tutorCurveLabel(
              stroke,
              'B: unattainable for now',
              getTogetherObstacles([stroke]),
              undefined,
              getViewportFlowBounds()
            ),
          ],
          'Now show economic growth: draw the new PPF.'
        )
      } else if (need === 'ppf-growth') {
        session.growth = stroke
        const oldBulge = session.frontier && ppfBulgePoint(session.frontier)
        const newBulge = ppfBulgePoint(stroke)
        runTogetherAdamStep(8, [
          tutorCurveLabel(
            stroke,
            'PPF₂',
            getTogetherObstacles([stroke]),
            undefined,
            getViewportFlowBounds()
          ),
          ...(oldBulge && newBulge ? tutorArrowOps(oldBulge, newBulge) : []),
        ])
      }
    },
    [
      clearTogetherCorrectionInk,
      getTogetherObstacles,
      getViewportFlowBounds,
      isValidCurveStroke,
      zoom,
      reflowTogetherLabels,
      runTogetherAdamStep,
      runTogetherOps,
      showAcceptedStepFeedback,
      speakTogetherStep,
      updateTogetherCard,
    ]
  )

  useEffect(() => {
    if (pen.busy) return
    const pending = pendingTogetherRef.current
    if (!pending) return
    pendingTogetherRef.current = null
    pending()
  }, [pen.busy])

  useEffect(() => {
    const session = togetherSessionRef.current
    if (!session?.awaiting) return
    const next = strokes.find((stroke) => !session.baselineIds.has(stroke.id))
    if (!next) return
    session.baselineIds.add(next.id)
    handleTogetherStudentStroke(next)
  }, [handleTogetherStudentStroke, strokes])

  const startDrawWithAdam = useCallback(async (lesson: TogetherLesson = selectedLesson) => {
    clearTutorPen()
    speakerRef.current?.cancel()
    hintSpeakerRef.current?.cancel()
    setHintSpeakingId(null)
    setLessonMenuOpen(false)
    const phone = window.matchMedia('(max-width: 600px)').matches
    const box = placeTutorContent(360, 280, !phone)
    const id = uid()
    togetherSessionRef.current = {
      id,
      box,
      lesson,
      step: 1,
      awaiting: null,
      baselineIds: new Set(strokesRef.current.map((stroke) => stroke.id)),
      correctionOpIds: [],
      correctionBounds: [],
      tutorLabels: [],
    }
    setTool('pen')
    setTogetherStep(1)
    setCards([
      {
        id,
        anchor: { x: box.x + box.w + 24, y: box.y },
        boardBounds: { minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h },
        text: lesson.steps[0].say,
        status: 'done',
        history: [],
        followup: '',
        mode: 'together',
        togetherMode: true,
        togetherStep: 1,
        togetherTitle: lesson.title,
        togetherTotal: lesson.steps.length,
        level: 1,
        tracked: false,
        firedMarkers: 0,
        writeStates: {},
        writeBoxes: {},
        steps: [],
        revealedSteps: 1,
        reexplainCounts: {},
      },
    ])
    await fitMobileLessonFrame(box, lesson)
    if (togetherSessionRef.current?.id !== id) return
    const boardStrokes = strokesRef.current.map((stroke) => ({
      points: stroke.points,
      width: stroke.width,
    }))
    runTogetherAdamStep(
      1,
      tutorAxesOps(box, lesson.yLabel, lesson.xLabel, boardStrokes, getViewportFlowBounds())
    )
  }, [
    clearTutorPen,
    fitMobileLessonFrame,
    getViewportFlowBounds,
    placeTutorContent,
    runTogetherAdamStep,
    selectedLesson,
  ])

  useEffect(() => {
    const onStartLesson = (event: Event) => {
      const lessonId = (event as CustomEvent<string>).detail
      const lesson = TOGETHER_LESSONS.find((item) => item.id === lessonId)
      if (lesson) void startDrawWithAdam(lesson)
    }
    window.addEventListener('econ:start-lesson', onStartLesson)
    return () => window.removeEventListener('econ:start-lesson', onStartLesson)
  }, [startDrawWithAdam])

  const closeCard = (id: string) => {
    if (togetherSessionRef.current?.id === id) {
      endDrawWithAdam()
      return
    }
    if (hintSpeakingId === id) {
      hintSpeakerRef.current?.cancel()
      setHintSpeakingId(null)
    }
    setCards((cs) => cs.filter((c) => c.id !== id))
  }

  // ── Voice tutor (typed or mic in, spoken out; answered by the local Bonsai model) ──
  // The mic appears once the local Argmax speech server answers; keep checking
  // so it shows up (or goes away) without a reload when that server starts or stops.
  const [sttOK, setSttOK] = useState(speechRecognitionSupported())
  useEffect(() => {
    let alive = true
    const check = () => void probeSTT().then((ok) => alive && setSttOK(ok))
    check()
    const timer = setInterval(check, 8000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  /** True between "stop" and the words coming back from the speech model. */
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [interim, setInterim] = useState('')
  const [voiceUser, setVoiceUser] = useState('')
  const [voiceError, setVoiceError] = useState<string | null>(null)

  const recordingRef = useRef(false)
  const recordingPurposeRef = useRef<'voice' | 'clarify'>('voice')
  const clarifyCardIdRef = useRef<string | null>(null)
  const [clarifyRecordingId, setClarifyRecordingId] = useState<string | null>(null)
  const [clarifyPending, setClarifyPending] = useState('')
  const pendingTranscriptRef = useRef('')
  const interimRef = useRef('')
  const finishRecordingRef = useRef(false)
  const speakingRef = useRef(false)
  useEffect(() => void (speakingRef.current = speaking), [speaking])
  const recognizerRef = useRef<RecognizerHandle | null>(null)
  const voiceHistoryRef = useRef<HintTurn[]>([])
  const voiceBusyRef = useRef(false)

  useEffect(() => {
    void probeTTS().then(setTtsOK)
  }, [])

  const askVoiceTutor = useCallback(
    async (text: string) => {
      // A new question interrupts the reply in progress (see streamMathHint) instead of being dropped.
      const trimmed = text.trim()
      if (trimmed.length < 2) return

      // If Adam is already on the board, continue as a clarifying question
      // on the latest card (so highlight tool-calls land on that conversation).
      const latest = [...cardsRef.current].reverse().find(
        (c) => c.status === 'done' || c.status === 'streaming' || c.status === 'loading'
      )
      if (latest && (latest.mode === 'hint' || latest.mode === 'voice') && latest.status !== 'error') {
        runClarifyHint(latest.id, trimmed)
        return
      }

      voiceBusyRef.current = true
      cancelSpeech()
      hintSpeakerRef.current?.cancel()
      speakerRef.current?.cancel()
      setVoiceError(null)
      setThinking(true)
      if (phaseRef.current === 'awaiting_problem') markProblemSet()

      const id = uid()
      const wrapRect = paneRect()
      const anchor = wrapRect
        ? { x: wrapRect.width * 0.55, y: wrapRect.height * 0.2 }
        : { x: 420, y: 120 }

      setCards(() => [
        // One Adam at a time: a new card replaces any that are open, so they never stack or cover each other.
        {
          id,
          anchor,
          text: '',
          status: 'loading',
          history: [],
          followup: '',
          mode: 'voice',
          level: hintSize,
          maxLevel: hintSize,
          tracked: false,
          firedMarkers: 0,
          writeStates: {},
          writeBoxes: {},
          steps: [],
          revealedSteps: 1,
          reexplainCounts: {},
        },
      ])
      setHintSpeakingId(null)
      hintSpeakerRef.current = speakerOn && ttsOK
        ? new IncrementalSpeaker((on) => setHintSpeakingId(on ? id : null))
        : null

      let board: string | undefined
      let gridImage: string | undefined
      try {
        const cap = await Promise.race([
          captureBoard(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('capture-timeout')), 6000)
          ),
        ])
        board = cap.board ?? cap.region
        gridImage = gridCapture().gridImage
      } catch {
        /* board capture is optional — respond from text alone */
      }

      const history = voiceHistoryRef.current.slice(-6)
      let acc = ''
      let sentencesSpoken = 0
      const speakUpTo = (say: string, done: boolean) => {
        if (!say) return
        const spoken = speakableNarration(say, done)
        const parts = spoken.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? []
        const ready = done ? parts.length : Math.max(0, parts.length - 1)
        for (let i = sentencesSpoken; i < ready; i++) {
          hintSpeakerRef.current?.pushSentence(parts[i])
        }
        sentencesSpoken = Math.max(sentencesSpoken, ready)
      }

      await streamMathHint(
        {
          boardImage: board,
          gridImage,
          problemImages: problemImages(),
          recognizedLines: recognizedLinesPayload(),
          boardEmpty: strokesRef.current.length === 0 && imagesRef.current.length === 0,
          prompt: trimmed,
          history,
          mode: 'voice',
          apiKey,
          onGraph: drawOnBoard,
          onEquations: (equations) => {
            setCards((cs) => cs.map((c) => (c.id === id ? { ...c, equations } : c)))
            writeEquationsOnBoard(id, equations)
          },
        },
        (chunk) => {
          if (acc === '') setThinking(false)
          acc += chunk
          const display = cleanTutorProse(acc.replace(/^SAY:\s*/i, '').trim())
          const lines = extractHighlightLineNumbers(acc)
          if (lines.length) highlightRecognizedLines(lines)
          speakUpTo(display, false)
          setCards((cs) =>
            cs.map((c) =>
              c.id === id
                ? { ...c, text: display, status: 'streaming' as const, firedMarkers: Math.max(c.firedMarkers, 1) }
                : c
            )
          )
        },
        () => {
          const display =
            cleanTutorProse(acc.replace(/^SAY:\s*/i, '').trim()) ||
            "I didn't catch that — try asking again."
          const lines = extractHighlightLineNumbers(acc)
          if (lines.length) highlightRecognizedLines(lines)
          speakUpTo(display, true)
          hintSpeakerRef.current?.flush()
          voiceHistoryRef.current = display.trim()
            ? [
                ...history,
                { role: 'user', content: trimmed },
                { role: 'assistant', content: display },
              ]
            : history
          setCards((cs) =>
            cs.map((c) =>
              c.id === id
                ? {
                    ...c,
                    text: display,
                    status: 'done' as const,
                    history: voiceHistoryRef.current,
                    firedMarkers: Math.max(c.firedMarkers, 1),
                  }
                : c
            )
          )
          setThinking(false)
          voiceBusyRef.current = false
        },
        (err) => {
          setVoiceError(err)
          setThinking(false)
          voiceBusyRef.current = false
          setCards((cs) =>
            cs.map((c) => (c.id === id ? { ...c, status: 'error', error: err } : c))
          )
        },
        (hl) => highlightRecognizedLines(hl.lines)
      )
    },
    [
      apiKey,
      captureBoard,
      markProblemSet,
      speakerOn,
      ttsOK,
      hintSize,
      gridCapture,
      problemImages,
      recognizedLinesPayload,
      highlightRecognizedLines,
      runClarifyHint,
      paneRect,
      drawOnBoard,
      writeEquationsOnBoard,
    ]
  )

  const deliverRecording = useCallback(() => {
    setTranscribing(false)
    const text = `${pendingTranscriptRef.current} ${interimRef.current}`.trim()
    pendingTranscriptRef.current = ''
    interimRef.current = ''
    setInterim('')
    if (recordingPurposeRef.current === 'clarify') {
      const cardId = clarifyCardIdRef.current
      clarifyCardIdRef.current = null
      setClarifyRecordingId(null)
      setClarifyPending('')
      recordingPurposeRef.current = 'voice'
      if (cardId && text.length > 1) runClarifyHint(cardId, text)
      return
    }
    if (text.length > 1) void askVoiceTutor(text)
  }, [askVoiceTutor, runClarifyHint])

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return
    recordingRef.current = false
    setRecording(false)
    setListening(false)
    finishRecordingRef.current = true
    // Argmax transcribes after the recording ends, so the words take a moment.
    const slow = !!recognizerRef.current?.slowStop
    if (slow) setTranscribing(true)
    recognizerRef.current?.stop()
    // Fallback if the recognizer never reports that it has finished.
    setTimeout(
      () => {
        if (!finishRecordingRef.current) return
        finishRecordingRef.current = false
        recognizerRef.current = null
        deliverRecording()
      },
      slow ? 65000 : 450
    )
  }, [deliverRecording])

  const cleanupVoice = useCallback(() => {
    recordingRef.current = false
    finishRecordingRef.current = false
    voiceBusyRef.current = false
    setRecording(false)
    setTranscribing(false)
    setListening(false)
    setInterim('')
    setThinking(false)
    pendingTranscriptRef.current = ''
    interimRef.current = ''
    recognizerRef.current?.abort()
    recognizerRef.current = null
    speakerRef.current?.cancel()
    hintSpeakerRef.current?.cancel()
    setHintSpeakingId(null)
    cancelSpeech()
  }, [])

  const startRecording = useCallback(() => {
    if (!sttOK) {
      setVoiceError('Voice input needs the Argmax speech server running on this computer.')
      return
    }
    // A new question interrupts the reply in progress (see streamMathHint) instead of being dropped.
    recordingPurposeRef.current = 'voice'
    clarifyCardIdRef.current = null
    setClarifyRecordingId(null)
    setVoiceError(null)
    pendingTranscriptRef.current = ''
    interimRef.current = ''
    setVoiceUser('')
    const rec = createRecognizer({
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false)
        if (finishRecordingRef.current) {
          finishRecordingRef.current = false
          recognizerRef.current = null
          deliverRecording()
          return
        }
        // Chrome ends the session after a pause — keep listening only while recording.
        if (recordingRef.current) recognizerRef.current?.start()
      },
      onError: (e) => {
        if (e === 'not-allowed' || e === 'service-not-allowed') {
          setVoiceError('Microphone permission was blocked.')
          cleanupVoice()
        } else if (e !== 'no-speech' && e !== 'aborted') {
          setTranscribing(false)
          setVoiceError(e)
        }
      },
      onInterim: (t) => {
        interimRef.current = t
        setInterim(t)
        if (speakingRef.current) speakerRef.current?.cancel() // barge-in
      },
      onFinal: (t) => {
        interimRef.current = ''
        setInterim('')
        const trimmed = t.trim()
        if (!trimmed) return
        pendingTranscriptRef.current = pendingTranscriptRef.current
          ? `${pendingTranscriptRef.current} ${trimmed}`
          : trimmed
        setVoiceUser(pendingTranscriptRef.current)
      },
    })
    if (!rec) {
      setVoiceError('Voice input unavailable in this browser.')
      return
    }
    recognizerRef.current = rec
    recordingRef.current = true
    setRecording(true)
    rec.start()
  }, [sttOK, cleanupVoice, deliverRecording])

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) stopRecording()
    else startRecording()
  }, [startRecording, stopRecording])

  const toggleClarifyMic = useCallback(
    (cardId: string) => {
      if (!sttOK) return
      if (recordingRef.current && clarifyCardIdRef.current === cardId) {
        stopRecording()
        return
      }
      if (recordingRef.current) stopRecording()
      recordingPurposeRef.current = 'clarify'
      clarifyCardIdRef.current = cardId
      setClarifyRecordingId(cardId)
      setClarifyPending('')
      pendingTranscriptRef.current = ''
      interimRef.current = ''
      setInterim('')
      const rec = createRecognizer({
        onStart: () => setListening(true),
        onEnd: () => {
          setListening(false)
          if (finishRecordingRef.current) {
            finishRecordingRef.current = false
            recognizerRef.current = null
            deliverRecording()
            return
          }
          if (recordingRef.current) recognizerRef.current?.start()
        },
        onError: () => {
          cleanupVoice()
          setClarifyRecordingId(null)
          setClarifyPending('')
        },
        onInterim: (t) => {
          interimRef.current = t
          setInterim(t)
        },
        onFinal: (t) => {
          interimRef.current = ''
          setInterim('')
          const trimmed = t.trim()
          if (!trimmed) return
          pendingTranscriptRef.current = pendingTranscriptRef.current
            ? `${pendingTranscriptRef.current} ${trimmed}`
            : trimmed
          setClarifyPending(pendingTranscriptRef.current)
        },
      })
      if (!rec) return
      recognizerRef.current = rec
      recordingRef.current = true
      setRecording(true)
      rec.start()
    },
    [sttOK, stopRecording, deliverRecording, cleanupVoice]
  )

  const submitPrompt = useCallback(() => {
    const q = prompt.trim()
    if (!q || recordingRef.current) return
    const context = [lessonContextRef.current, q].filter(Boolean).join('\n').slice(-4000)
    lessonContextRef.current = context
    setLessonContext(context)
    setPrompt('')
    void askVoiceTutor(q)
  }, [prompt, askVoiceTutor])

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((on) => {
      if (on) {
        speakerRef.current?.cancel()
        hintSpeakerRef.current?.cancel()
        setHintSpeakingId(null)
        cancelSpeech()
      }
      return !on
    })
  }, [])

  useEffect(() => cleanupVoice, [cleanupVoice]) // stop mic/speech on unmount

  const cursor = isPanning
    ? 'grabbing'
    : spaceMove
      ? 'grab'
      : tool === 'pen' || tool === 'highlight'
        ? 'crosshair'
        : tool === 'eraser'
          ? 'cell'
          : 'default'

  const toolBtn = (t: Tool, label: string) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      title={label}
      className="btn-ghost"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12,
        padding: '6px 10px',
        ...(tool === t || (t === 'off' && spaceMove) ? ACTIVE_GLASS : {}),
      }}
    >
      {label}
    </button>
  )

  const toolbarVertical = toolbarDragging
    ? toolbarDragVertical
    : toolbarDock === 'left' || toolbarDock === 'right'

  const onToolbarDragStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const pane = paneRect()
    const el = toolbarRef.current
    if (!pane || !el) return

    const grip = e.currentTarget as HTMLElement
    try {
      grip.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const bar = el.getBoundingClientRect()
    toolbarPaneOrigin.current = {
      left: pane.left,
      top: pane.top,
      width: pane.width,
      height: pane.height,
    }
    // Offset from the shell's visual top-left → stays glued to this grab point.
    toolbarDragOffset.current = {
      x: e.clientX - bar.left,
      y: e.clientY - bar.top,
    }
    toolbarGrabClient.current = { x: e.clientX, y: e.clientY }

    const start = {
      x: bar.left - pane.left,
      y: bar.top - pane.top,
    }
    const w0 = el.offsetWidth
    const h0 = el.offsetHeight
    const keepVertical = toolbarDock === 'left' || toolbarDock === 'right'
    // Record the live orientation; fill the other from cache or a one-shot measure.
    if (keepVertical) toolbarOrientSize.current.vertical = { w: w0, h: h0 }
    else toolbarOrientSize.current.horizontal = { w: w0, h: h0 }
    if (keepVertical && !toolbarOrientSize.current.horizontal) {
      toolbarOrientSize.current.horizontal = measureToolbarOrientation(el, false)
    } else if (!keepVertical && !toolbarOrientSize.current.vertical) {
      toolbarOrientSize.current.vertical = measureToolbarOrientation(el, true)
    }

    toolbarFreeRef.current = start
    toolbarDraggingRef.current = true
    setToolbarFree(start)
    setToolbarDragVertical(keepVertical)
    // Keep dock for layout orientation — only is-dragging takes over position.
    setToolbarDragging(true)

    // GPU-composited position. React style intentionally omits left/top while
    // dragging so re-renders cannot yank the bar back behind the cursor.
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.right = 'auto'
    el.style.bottom = 'auto'
    el.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`
    el.style.pointerEvents = 'none'

    const sizeForDock = (dock: ToolbarDock, liveW: number, liveH: number): ToolbarSize => {
      const wantVertical = dock === 'left' || dock === 'right'
      if (wantVertical === keepVertical) return { w: liveW, h: liveH }
      const cached = wantVertical
        ? toolbarOrientSize.current.vertical
        : toolbarOrientSize.current.horizontal
      if (cached && cached.w > 8 && cached.h > 8) return cached
      // Last resort only — prefer cached real layout size above.
      return { w: liveH, h: liveW }
    }

    const placeGhost = (dock: ToolbarDock, liveW: number, liveH: number) => {
      const ghost = toolbarGhostRef.current
      if (!ghost) return
      const origin = toolbarPaneOrigin.current
      const size = sizeForDock(dock, liveW, liveH)
      const rect = toolbarDockGhostRect(dock, size, origin.width, origin.height, competition)
      if (!rect) {
        ghost.style.opacity = '0'
        return
      }
      ghost.style.opacity = '1'
      ghost.style.width = `${rect.width}px`
      ghost.style.height = `${rect.height}px`
      ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
    }

    let lastSnap: ToolbarDock = 'free'
    placeGhost('free', w0, h0)
    setToolbarSnapDock(null)

    const onMove = (ev: PointerEvent) => {
      const node = toolbarRef.current
      if (!node) return
      const origin = toolbarPaneOrigin.current
      const next = {
        x: ev.clientX - origin.left - toolbarDragOffset.current.x,
        y: ev.clientY - origin.top - toolbarDragOffset.current.y,
      }
      const w = node.offsetWidth
      const h = node.offsetHeight
      next.x = Math.max(-w + 40, Math.min(origin.width - 40, next.x))
      next.y = Math.max(0, Math.min(origin.height - 24, next.y))
      toolbarFreeRef.current = next
      node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`

      const snapped = snapToolbarDock(next.x, next.y, w, h, origin.width, origin.height)
      placeGhost(snapped.dock, w, h)
      if (snapped.dock !== lastSnap) {
        lastSnap = snapped.dock
        setToolbarSnapDock(snapped.dock === 'free' ? null : snapped.dock)
      }
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      try {
        grip.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }

      const node = toolbarRef.current
      const ghost = toolbarGhostRef.current
      const origin = toolbarPaneOrigin.current
      const pos = toolbarFreeRef.current
      setToolbarSnapDock(null)

      if (!node) {
        toolbarDraggingRef.current = false
        toolbarGrabClient.current = null
        setToolbarDragging(false)
        setToolbarDragVertical(false)
        if (ghost) ghost.style.opacity = '0'
        return
      }

      const w = node.offsetWidth
      const h = node.offsetHeight
      const snapped = snapToolbarDock(pos.x, pos.y, w, h, origin.width, origin.height)

      const clearDragInline = () => {
        node.style.transition = ''
        node.style.left = ''
        node.style.top = ''
        node.style.right = ''
        node.style.bottom = ''
        node.style.transform = ''
        node.style.pointerEvents = ''
        node.style.willChange = ''
      }

      const persist = () => {
        try {
          sessionStorage.setItem(TOOLBAR_DOCK_KEY, JSON.stringify(snapped))
        } catch {
          /* ignore */
        }
      }

      toolbarDraggingRef.current = false
      toolbarGrabClient.current = null

      // Free drop — settle where it is, no dock morph.
      if (snapped.dock === 'free') {
        if (ghost) ghost.style.opacity = '0'
        setToolbarDock('free')
        setToolbarFree(pos)
        setToolbarDragging(false)
        setToolbarDragVertical(false)
        clearDragInline()
        persist()
        return
      }

      // FLIP: capture the live rect, commit final dock layout, then invert+play.
      toolbarFlipFirst.current = node.getBoundingClientRect()
      if (ghost) {
        ghost.style.transition = `opacity ${TOOLBAR_FLIP_MS}ms ${TOOLBAR_FLIP_EASE}`
        ghost.style.opacity = '0'
      }
      setToolbarDock(snapped.dock)
      setToolbarFree(snapped.free)
      setToolbarDragVertical(false)
      setToolbarDragging(false)
      setToolbarSnapping(true)
      persist()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const clarifyLiveTranscript = clarifyRecordingId
    ? [clarifyPending, interim].filter(Boolean).join(' ')
    : ''

  // Minimal floating live-transcript pill above the mic — just what the
  // student is saying (or an error), liquid glass, nothing else. Adam's
  // own reply already appears in the coach card that pops up separately.
  const voiceTranscriptText =
    voiceError ||
    interim ||
    voiceUser ||
    (transcribing ? 'Transcribing on this Mac…' : thinking ? 'Thinking…' : recording ? 'Listening… tap the mic when you are done' : '')
  const voicePanel =
    !clarifyRecordingId &&
    (recording || transcribing || thinking || voiceError) &&
    voiceTranscriptText && (
      <div
        data-html2canvas-ignore
        className="math-voice-panel"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 68,
          zIndex: 47,
          maxWidth: 'min(100% - 32px, 480px)',
        }}
      >
        <div className="math-voice-transcript">
          {recording && !voiceError && <span className="math-voice-dot" />}
          <span
            className={`math-voice-transcript__text${
              voiceError ? ' math-voice-transcript__text--error' : interim ? ' math-voice-transcript__text--interim' : ''
            }`}
          >
            {voiceTranscriptText}
          </span>
        </div>
      </div>
    )

  const iconBtnStyle = (active: boolean, activeColor = '#0d766e'): CSSProperties => ({
    display: 'grid',
    placeItems: 'center',
    width: 36,
    height: 36,
    padding: 0,
    flexShrink: 0,
    color: active ? activeColor : 'rgba(0,0,0,0.7)',
    ...(active ? ACTIVE_GLASS : {}),
    ...(active ? { color: activeColor } : {}),
  })
  const secureMicContext = typeof window === 'undefined' || window.isSecureContext
  const micAvailable = sttOK && secureMicContext

  useEffect(() => {
    onVoiceAvailabilityChange?.(micAvailable)
  }, [micAvailable, onVoiceAvailabilityChange])

  return (
    <>
      {/* Ink + pasted images live inside the viewport so they pan/zoom with the board.
          Images render FIRST (underneath) so pen strokes land visibly ON TOP of them. */}
      <EdgeLabelRenderer>
        {images.map((im) => {
          const selected = selectedImageId === im.id
          const interactive = tool === 'off'
          return (
            <div
              key={im.id}
              className="nodrag nopan"
              data-mathimg-wrap={im.id}
              data-html2canvas-ignore
              onPointerDown={(e) => onImagePointerDown(e, im, 'drag')}
              onPointerMove={onImagePointerMove}
              onPointerUp={onImagePointerUp}
              onPointerCancel={onImagePointerUp}
              style={{
                position: 'absolute',
                left: im.x,
                top: im.y,
                width: im.w,
                height: im.h,
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? (selected ? 'grab' : 'pointer') : 'default',
                borderRadius: 6,
                boxShadow: selected
                  ? '0 0 0 2px #2563eb, 0 2px 12px rgba(0,0,0,0.15)'
                  : '0 2px 12px rgba(0,0,0,0.15)',
              }}
            >
              <img
                src={im.src}
                alt="pasted"
                data-mathimg={im.id}
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  borderRadius: 6,
                  display: 'block',
                  userSelect: 'none',
                }}
              />
              {selected && interactive && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onImagePointerDown(e, im, 'resize')
                  }}
                  title="Resize"
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: '#2563eb',
                    border: '2px solid #fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    cursor: 'nwse-resize',
                  }}
                />
              )}
            </div>
          )
        })}
        <svg
          data-html2canvas-ignore
          style={{
            position: 'absolute',
            left: -INK_OFFSET,
            top: -INK_OFFSET,
            width: INK_OFFSET * 2,
            height: INK_OFFSET * 2,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {/* Recognized-line highlight: a fat translucent under-stroke behind
              exactly the ink the tutor is referring to ("look at line 3"). */}
          {glowStrokeIds.size > 0 &&
            strokes
              .filter((st) => glowStrokeIds.has(st.id))
              .map((st) => (
                <path
                  key={`glow-${st.id}`}
                  d={pointsToPath(st.points)}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={Math.max(st.width * 4, st.width + 10)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.45}
                />
              ))}
          {strokes.map((st) => (
            <path
              key={st.id}
              d={pointsToPath(st.points)}
              fill="none"
              stroke={st.color}
              strokeWidth={st.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {draft && (
            <path
              d={pointsToPath(draft.points)}
              fill="none"
              stroke={draft.color}
              strokeWidth={draft.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {pen.strokes.map((stroke) => (
            <g key={stroke.id}>
              {freshTutorStrokeIds.has(stroke.id) && (
                <path
                  className="math-tutor-ink-glow"
                  d={pointsToPath(stroke.points)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width + 7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={stroke.dashed ? '6 5' : undefined}
                />
              )}
              <path
                d={pointsToPath(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={stroke.dashed ? '6 5' : undefined}
                opacity={0.95}
              />
            </g>
          ))}
          {pen.labels.map((label) => (
            <text
              key={label.id}
              x={label.x + INK_OFFSET}
              y={label.y + INK_OFFSET}
              fill={label.color}
              fontSize={label.size}
              fontFamily='"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive'
              opacity={0.95}
            >
              {label.text}
            </text>
          ))}
        </svg>

        {cards.flatMap((card) =>
          card.mode === 'hint' && card.boardBounds && (card.firedMarkers > 0 || card.heldZone)
            ? [
                <MathGuidedSpotlight
                  key={`spot-${card.id}`}
                  cardId={card.id}
                  say={card.text}
                  firedMarkers={card.firedMarkers}
                  strokes={strokes}
                  boardBounds={card.boardBounds}
                  writeStates={card.writeStates}
                  writeBoxes={card.writeBoxes ?? {}}
                  heldZone={card.heldZone}
                  occupied={cardOccupied(images, card)}
                />,
              ]
            : []
        )}

        {cards.map((card) => (
          <MathTutorHighlight key={`hl-${card.id}`} session={card} zoom={zoom} />
        ))}
      </EdgeLabelRenderer>

      {/* Interaction overlay — only captures pointers when a math tool is active */}
      <div
        ref={overlayRef}
        data-together-step={togetherStep ?? undefined}
        data-together-box={
          togetherSessionRef.current
            ? `${togetherSessionRef.current.box.x},${togetherSessionRef.current.box.y},${togetherSessionRef.current.box.w},${togetherSessionRef.current.box.h}`
            : undefined
        }
        data-html2canvas-ignore
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          cursor,
          touchAction: 'none',
          pointerEvents: tool === 'off' ? 'none' : 'auto',
        }}
      >
        {sel && (
          <div
            style={{
              position: 'absolute',
              left: sel.x,
              top: sel.y,
              width: sel.w,
              height: sel.h,
              border: '2px dashed rgba(0,0,0,0.5)',
              background: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              borderRadius: 6,
            }}
          />
        )}
      </div>

      {/* Graph recognition: a small tag on each graph the checker identified */}
      <div
        data-html2canvas-ignore
        className="math-graph-tags"
        style={{ position: 'absolute', inset: 0, zIndex: 44, pointerEvents: 'none' }}
      >
        {(() => {
          const wrap = paneRect()
          if (!wrap) return null
          const lessonBox = togetherSessionRef.current?.box
          return inkModel.lines.flatMap((line) => {
            if (lessonBox && overlapsTogetherBox(line.bounds, lessonBox)) return []
            const g = line.graph
            if (!g) return []
            const tl = rf.flowToScreenPosition({ x: line.bounds.minX, y: line.bounds.minY })
            const graphKey = `${[...line.strokeIds].sort().join(',')}|${g.mistake ?? ''}`
            const wholeCurve = g.status === 'mistake' && isWholeCurveMistake(g)
            const wrongCurves = wholeCurve
              ? graphWrongCurveStrokes(g, line.strokeIds, strokesRef.current)
              : []
            const replayable =
              g.status === 'mistake' &&
              graphCorrectionOps(g, line.strokeIds, strokesRef.current).length > 0
            const label =
              g.status === 'mistake'
                ? `${g.name}: check ${g.mistake ?? 'this graph'}`
                : g.status === 'unknown'
                  ? 'Graph'
                  : g.name
            const tip =
              g.status === 'mistake'
                ? [g.explanation, g.fix, replayable ? 'Click to draw the correction again.' : ''].filter(Boolean).join(' ')
                : g.status === 'recognized' && g.checked
                  ? 'Checked: demand slopes down, supply slopes up, and the labels are on the right curves.'
                  : g.status === 'recognized'
                    ? `Recognized as a ${g.name} graph. No mistakes flagged, though the checker can miss some.`
                  : 'The graph checker could not tell what kind of graph this is.'
            const out = [
              <div
                key={`gtag-${line.strokeIds[0]}`}
                className={`math-graph-tag is-${g.status}${g.checked ? ' is-checked' : ''}${replayable ? ' is-replayable' : ''}`}
                title={tip}
                onClick={
                  replayable
                    ? () => pen.enqueue(graphCorrectionOps(g, line.strokeIds, strokesRef.current))
                    : undefined
                }
                style={{ left: Math.max(4, tl.x - wrap.left), top: Math.max(4, tl.y - wrap.top - 30) }}
              >
                {g.status === 'mistake' ? (
                  <AlertTriangle size={12} strokeWidth={2.5} />
                ) : g.checked ? (
                  <Check size={12} strokeWidth={3} />
                ) : (
                  <LineChart size={12} strokeWidth={2.5} />
                )}
                <span>{label}</span>
              </div>,
            ]
            if (
              wholeCurve &&
              wrongCurves[0] &&
              g.explanation
            ) {
              const endpoint = wrongCurves[0].points[wrongCurves[0].points.length - 1]
              if (endpoint) {
                const point = rf.flowToScreenPosition(endpoint)
                const noteWidth = Math.min(250, wrap.width - 24)
                out.push(
                  <div
                    key={`gexplain-${line.strokeIds[0]}`}
                    className="math-graph-explanation"
                    style={{
                      left: Math.max(8, Math.min(point.x - wrap.left + 12, wrap.width - noteWidth - 8)),
                      top: Math.max(8, Math.min(point.y - wrap.top + 8, wrap.height - 88)),
                      width: noteWidth,
                    }}
                  >
                    {g.explanation}
                  </div>
                )
              }
            }
            if (
              g.status === 'mistake' &&
              g.errorBox &&
              !wholeCurve &&
              !drawnGraphKeys.has(graphKey)
            ) {
              const a = rf.flowToScreenPosition({ x: g.errorBox.minX, y: g.errorBox.minY })
              const b = rf.flowToScreenPosition({ x: g.errorBox.maxX, y: g.errorBox.maxY })
              const pad = 14
              out.push(
                <div
                  key={`gerr-${line.strokeIds[0]}`}
                  className="math-graph-error-ring"
                  style={{
                    left: a.x - wrap.left - pad,
                    top: a.y - wrap.top - pad,
                    width: b.x - a.x + pad * 2,
                    height: b.y - a.y + pad * 2,
                  }}
                />
              )
            }
            return out
          })
        })()}
      </div>

      <div
        data-html2canvas-ignore
        className="math-ocr-read-layer"
        style={{ position: 'absolute', inset: 0, zIndex: 47, pointerEvents: 'none' }}
      >
        {(() => {
          const wrap = paneRect()
          if (!wrap) return null
          return inkModel.lines.flatMap((line) => {
            if (!line.latex || line.graph) return []
            const key = recognitionOverrideKey(line.strokeIds)
            const text = recognitionOverrides[key] ?? line.latex
            const point = rf.flowToScreenPosition({ x: line.bounds.minX, y: line.bounds.maxY + 8 })
            return [
              <div
                key={`ocr-read-${key}`}
                className="math-ocr-read-chip"
                style={{ left: point.x - wrap.left, top: point.y - wrap.top }}
              >
                {editingRecognitionKey === key ? (
                  <input
                    autoFocus
                    aria-label="Correct recognized handwriting"
                    maxLength={120}
                    value={editingRecognitionText}
                    onChange={(event) => setEditingRecognitionText(event.target.value)}
                    onBlur={() => saveRecognitionOverride(key, editingRecognitionText)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        saveRecognitionOverride(key, editingRecognitionText)
                      } else if (event.key === 'Escape') {
                        setEditingRecognitionKey(null)
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    title={`Adam read: ${text}`}
                    onClick={() => {
                      setEditingRecognitionText(text)
                      setEditingRecognitionKey(key)
                    }}
                  >
                    Adam read: {text} ✎
                  </button>
                )}
              </div>,
            ]
          })
        })()}
      </div>

      {pen.cursor?.visible &&
        (() => {
          const cursor = pen.cursor
          const wrap = paneRect()
          if (!cursor || !wrap) return null
          const point = rf.flowToScreenPosition({ x: cursor.x, y: cursor.y })
          return (
            <div
              data-html2canvas-ignore
              className="math-adam-cursor-layer"
              style={{ position: 'absolute', inset: 0, zIndex: 46, pointerEvents: 'none' }}
            >
              <div
                className={`math-adam-cursor${cursor.drawing ? ' is-drawing' : ''}`}
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate3d(${point.x - wrap.left}px, ${point.y - wrap.top}px, 0) translate(-5px, -18px)`,
                }}
              >
                <span className="math-adam-cursor__badge">
                  <PenLine size={15} strokeWidth={2.4} />
                </span>
                {cursor.drawing && <span className="math-adam-cursor__name">Adam</span>}
              </div>
            </div>
          )
        })()}

      {acceptedStepCue &&
        (() => {
          const wrap = paneRect()
          if (!wrap) return null
          const point = rf.flowToScreenPosition({ x: acceptedStepCue.x, y: acceptedStepCue.y })
          return (
            <div
              data-html2canvas-ignore
              className="math-accepted-step-cue-layer"
              style={{ position: 'absolute', inset: 0, zIndex: 48, pointerEvents: 'none' }}
            >
              <svg
                key={acceptedStepCue.id}
                className="math-accepted-step-check"
                viewBox="0 0 32 32"
                aria-hidden="true"
                style={{ left: point.x - wrap.left, top: point.y - wrap.top }}
              >
                <circle cx="16" cy="16" r="14" />
                <path pathLength="1" d="M8 16.5 13.5 22 24.5 10" />
              </svg>
            </div>
          )
        })()}

      {/* Write-box submit ✓ — screen-space so it stays tappable above the ink overlay */}
      <div
        data-html2canvas-ignore
        style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none' }}
      >
        {cards.flatMap((card) => {
          if (
            card.mode !== 'hint' ||
            !card.boardBounds ||
            card.firedMarkers === 0 ||
            card.status === 'loading' ||
            card.status === 'streaming'
          ) {
            return []
          }
          const wrap = paneRect()
          if (!wrap) return []
          const occupied = cardOccupied(images, card)
          const { writes } = resolveFiredMarkers(
            card.text,
            card.firedMarkers,
            strokes,
            card.boardBounds,
            12,
            occupied,
            card.writeBoxes ?? {}
          )
          return writes.flatMap((wz) => {
            const state = card.writeStates[wz.index] ?? 'open'
            if (state !== 'open' && state !== 'filled') return []
            const br = rf.flowToScreenPosition({ x: wz.box.maxX, y: wz.box.maxY })
            return [
              <button
                key={`zcheck-${card.id}-${wz.index}`}
                type="button"
                className={`math-write-zone-check${state === 'filled' ? ' is-ready' : ''}`}
                title={
                  state === 'filled'
                    ? "I'm done — check my work"
                    : 'Write your answer in the box, then tap here'
                }
                style={{ left: br.x - wrap.left - 14, top: br.y - wrap.top - 14 }}
                onClick={() => state === 'filled' && checkWriteZone(card.id, wz.index)}
              >
                <Check size={14} strokeWidth={3} />
              </button>,
            ]
          })
        })}
      </div>

      <MathTutorScreenLayer
        sessions={cards}
        rf={rf}
        zoom={zoom}
        viewportX={x}
        viewportY={y}
        strokes={strokes}
        tutorStrokes={pen.strokes}
        images={images}
        occupied={[]}
        chrome={chromeRects}
        getPaneRect={paneRect}
        // True only while the TTS voice is audibly speaking — the typewriter
        // waits for this so on-screen words stay in sync with the audio, and
        // the head animates from either signal (voice OR visible typing).
        talkingFor={(id) => hintSpeakingId === id}
        onMarkersFired={onMarkersFired}
        onClose={closeCard}
        clarifyRecordingId={clarifyRecordingId}
        clarifyInterim={clarifyRecordingId ? interim : ''}
        clarifyLiveTranscript={clarifyLiveTranscript}
        sttOK={sttOK}
        onClarifyMic={toggleClarifyMic}
        onAnotherHint={(id) => {
          const card = cardsRef.current.find((c) => c.id === id)
          if (card) resolveCard(card, 'hint')
        }}
        onFullSolution={(id) => {
          const card = cardsRef.current.find((c) => c.id === id)
          if (card) resolveCard(card, 'solve')
        }}
        onGeneralize={() => void requestGeneralize()}
        onAdvanceStep={advanceStep}
        onReexplainStep={reexplainStep}
        onEndTogether={endDrawWithAdam}
        onStartSuggestedLesson={(lessonId) => {
          const lesson = TOGETHER_LESSONS.find((item) => item.id === lessonId)
          if (lesson) void startDrawWithAdam(lesson)
        }}
      />

      {/* Dock preview — faint silhouette of where the bar will land */}
      <div
        ref={toolbarGhostRef}
        data-html2canvas-ignore
        className={`math-toolbar-dock-ghost${toolbarSnapDock ? ' is-visible' : ''}`}
        aria-hidden
      />

      <div className="math-local-status" data-html2canvas-ignore ref={statusPopoverRef}>
        <button
          type="button"
          className="math-local-status__pill"
          aria-haspopup="dialog"
          aria-expanded={statusPopoverOpen}
          onClick={() => setStatusPopoverOpen((open) => !open)}
        >
          <span className="math-local-status__pulse" aria-hidden />
          On-device · works offline
        </button>
        {statusPopoverOpen && (
          <div className="math-local-status__popover" role="dialog" aria-label="On-device services">
            {[
              ['bonsai', 'Bonsai-2 4B (tutor)'],
              ['argmax', 'Argmax (speech)'],
              ['graphChecker', 'Graph checker (vision model)'],
            ].map(([key, label]) => (
              <div className="math-local-status__service" key={key}>
                <span
                  className={`math-local-status__dot${localServices[key as keyof typeof localServices] ? ' is-ready' : ''}`}
                  aria-hidden
                />
                <span>{label}</span>
              </div>
            ))}
            <p>All AI runs on this laptop. No cloud or data-center calls, and it works with no internet.</p>
          </div>
        )}
      </div>
      {hubOffline && (
        <div className="math-hub-offline" role="status">
          Hub offline: lessons still work. Graph checking and Bonsai need the hub.
        </div>
      )}

      {/* Toolbar */}
      <div
        ref={toolbarRef}
        data-html2canvas-ignore
        className={[
          'math-toolbar-shell',
          toolbarDragging ? 'is-dragging' : '',
          toolbarSnapping ? 'is-snapping' : '',
          toolbarVertical ? 'is-vertical' : '',
          // While dragging, drop dock-* so CSS transforms don't fight translate3d.
          // During FLIP snap, dock-* must be on so we measure the real end layout.
          !toolbarDragging && toolbarDock !== 'free' ? `dock-${toolbarDock}` : '',
          competition ? 'is-competition' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={toolbarShellStyle(toolbarFree, toolbarDock, toolbarDragging, toolbarSnapping)}
      >
        <div
          className="math-toolbar-grip"
          title="Move toolbar"
          onPointerDown={onToolbarDragStart}
        />
        <div className="card math-toolbar-body">
          <div className="math-toolbar-main">
            <div className="math-toolbar-main-tools">
              {toolBtn('pen', 'Pen')}
              {toolBtn('eraser', 'Eraser')}
              <button
                type="button"
                className="btn-ghost"
                title="Undo (Ctrl+Z)"
                onClick={undo}
                disabled={past.current.length === 0}
                style={{ fontSize: 12, padding: '6px 10px', opacity: past.current.length === 0 ? 0.4 : 1 }}
              >
                Undo
              </button>
              <button
                type="button"
                className="btn-ghost"
                title="Redo (Ctrl+Y)"
                onClick={redo}
                disabled={future.current.length === 0}
                style={{ fontSize: 12, padding: '6px 10px', opacity: future.current.length === 0 ? 0.4 : 1 }}
              >
                Redo
              </button>
            </div>

            <div className="math-toolbar-quick-colors" aria-label="Pen colors">
              {QUICK_PEN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c)
                    if (tool !== 'pen') setTool('pen')
                  }}
                  title={c === '#111111' ? 'Black' : c}
                  aria-label={`Pen color ${c === '#111111' ? 'black' : c}`}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? '2px solid #111' : '2px solid #fff',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>

            <div className="math-draw-together-group">
              <button
                type="button"
                className="btn-ghost math-draw-together-btn"
                title={`Draw ${selectedLesson.title} with Adam`}
                aria-pressed={togetherStep !== null}
                onClick={() => startDrawWithAdam()}
              >
                <PenLine size={14} />
                Draw with Adam
              </button>
              <button
                type="button"
                className="btn-ghost math-draw-together-menu-button"
                aria-label="Choose a Draw with Adam lesson"
                aria-haspopup="menu"
                aria-expanded={lessonMenuOpen}
                onClick={() => setLessonMenuOpen((open) => !open)}
              >
                <ChevronDown size={13} />
              </button>
              {lessonMenuOpen && (
                <div className="math-draw-together-menu" role="menu">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={lessonOverrideId === null}
                    onClick={() => {
                      setLessonOverrideId(null)
                      setLessonMenuOpen(false)
                    }}
                  >
                    Automatic · {detectedLesson.title}
                  </button>
                  {TOGETHER_LESSONS.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={lessonOverrideId === lesson.id}
                      onClick={() => {
                        setLessonOverrideId(lesson.id)
                        setLessonMenuOpen(false)
                      }}
                    >
                      {lesson.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="math-toolbar-more-wrap" ref={moreMenuRef}>
              <button
                type="button"
                className="btn-ghost math-toolbar-more-button"
                aria-haspopup="dialog"
                aria-expanded={moreMenuOpen}
                onClick={() => setMoreMenuOpen((open) => !open)}
              >
                ⋯ More
              </button>
              {moreMenuOpen && (
                <div
                  className="math-toolbar-more-menu"
                  role="dialog"
                  aria-label="More drawing tools"
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button, label')) setMoreMenuOpen(false)
                  }}
                >
                  <div className="math-toolbar-more-section">
                    {toolBtn('off', 'Move')}
                    {toolBtn('highlight', 'Hint select')}
                  </div>
                  <div className="math-toolbar-more-section">
                    <span className="math-toolbar-more-label">Pen size</span>
                    {PEN_SIZES.map((sVal) => (
                      <button
                        key={sVal}
                        type="button"
                        onClick={() => setSize(sVal)}
                        title={`${sVal}px`}
                        className="btn-ghost"
                        style={{
                          width: 28,
                          height: 28,
                          display: 'grid',
                          placeItems: 'center',
                          padding: 0,
                          ...(size === sVal ? ACTIVE_GLASS : {}),
                        }}
                      >
                        <span
                          style={{
                            width: sVal + 3,
                            height: sVal + 3,
                            borderRadius: '50%',
                            background: '#111',
                            display: 'block',
                          }}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="math-toolbar-more-section">
                    <span className="math-toolbar-more-label">Other colors</span>
                    {PEN_COLORS.filter((c) => !QUICK_PEN_COLORS.includes(c)).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setColor(c)
                          if (tool !== 'pen') setTool('pen')
                        }}
                        title={c}
                        aria-label={`Pen color ${c}`}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: c,
                          border: color === c ? '2px solid #111' : '2px solid #fff',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                  <div className="math-toolbar-more-section">
                    {HINT_SIZES.map((s) => (
                      <button
                        key={s.level}
                        type="button"
                        className="btn-ghost math-hint-size-btn"
                        title={s.title}
                        onClick={() => setHintSize(s.level)}
                        style={{
                          fontSize: 11,
                          padding: '5px 8px',
                          ...(hintSize === s.level ? ACTIVE_GLASS : {}),
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost math-hint-go-btn"
                      title="Get a hint on your work"
                      disabled={strokes.length === 0 && images.length === 0}
                      onClick={() => void requestBoardHint(hintSize)}
                    >
                      Hint
                    </button>
                    <button
                      type="button"
                      className="btn-ghost math-hint-go-btn"
                      title="Step back: learn the general approach for this TYPE of problem"
                      disabled={strokes.length === 0 && images.length === 0}
                      onClick={() => void requestGeneralize()}
                    >
                      Generalize
                    </button>
                  </div>
                  <div className="math-toolbar-more-section">
                    <label className="btn-ghost math-toolbar-more-action" title="Upload image">
                      Image
                      <input type="file" accept="image/*" hidden onChange={onUpload} />
                    </label>
                    {(pen.strokes.length > 0 || pen.labels.length > 0) && (
                      <button type="button" className="math-adam-clear" onClick={clearTutorPen}>
                        Clear Adam&apos;s ink
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ghost math-toolbar-more-action"
                      title="Clear ink and images"
                      onClick={() => {
                        clearTutorPen()
                        setRecognitionOverrides({})
                        recognitionOverridesRef.current = {}
                        setLessonContext('')
                        lessonContextRef.current = ''
                        if (strokesRef.current.length === 0 && imagesRef.current.length === 0) {
                          if (boardAdventureRef.current) clearMathBoard(boardAdventureRef.current)
                          return
                        }
                        pushHistory()
                        strokesRef.current = []
                        imagesRef.current = []
                        setStrokes([])
                        setImages([])
                        setSelectedImageId(null)
                        if (boardAdventureRef.current) clearMathBoard(boardAdventureRef.current)
                        if (boardAdventureRef.current) {
                          saveMathBoard(boardAdventureRef.current, { strokes: [], images: [] })
                        }
                      }}
                    >
                      Clear ink
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {showGestureHint && (
            <div className="math-board-gesture-hint" role="status">
              Scroll or two-finger drag to move the board · pinch to zoom · hold Space to drag
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls. With voice input enabled: mic asks Adam a question
          (pops the coach card); speaker toggles whether replies are read
          aloud. Voice input is off by default (see voiceTutor.ts), in which
          case the typed question box below is shown instead. */}
      {competition && micAvailable ? (
        <div
          ref={(el) => {
            micBarRef.current = el
          }}
          data-html2canvas-ignore
          className="math-mic-bar"
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            type="button"
            className={recording ? 'btn-danger' : 'btn-ghost'}
            onClick={toggleRecording}
            disabled={!sttOK || thinking}
            title={
              recording
                ? 'Tap when done asking'
                : sttOK
                  ? 'Ask Adam a question'
                  : 'Voice needs Chrome/Edge'
            }
            aria-label={recording ? 'Stop recording' : 'Ask Adam'}
            style={{
              width: 42,
              height: 42,
              padding: 0,
              flexShrink: 0,
              color: recording ? undefined : '#0d9488',
              opacity: sttOK && !thinking ? 1 : 0.4,
            }}
          >
            {recording ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button
            type="button"
            className={speakerOn ? 'btn-primary' : 'btn-ghost'}
            onClick={toggleSpeaker}
            disabled={!ttsOK}
            title={
              speakerOn
                ? 'Adam speaks out loud. Click to mute (text only).'
                : 'Muted. Adam replies with text only. Click to turn voice on.'
            }
            aria-label={speakerOn ? 'Mute Adam voice' : 'Unmute Adam voice'}
            style={{
              width: 36,
              height: 36,
              padding: 0,
              flexShrink: 0,
              color: speakerOn ? undefined : 'rgba(0,0,0,0.45)',
              opacity: ttsOK ? 1 : 0.4,
            }}
          >
            {speakerOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      ) : (
        <div
          ref={(el) => {
            micBarRef.current = el
          }}
          data-html2canvas-ignore
          className={`card math-prompt-bar${togetherStep !== null ? ' is-together' : ''}`}
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            width: 'min(100% - 32px, 520px)',
          }}
        >
          <input
            ref={questionInputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitPrompt()
              }
            }}
            placeholder="Ask Adam a question about this problem"
            title={competition && !secureMicContext ? 'Voice input needs a secure HTTPS connection.' : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {competition && !secureMicContext && (
            <span
              className="math-mic-secure-note"
              title="Browsers only allow microphone access over HTTPS or localhost."
            >
              Mic needs HTTPS
            </span>
          )}
          {micAvailable && (
            <button
              type="button"
              onClick={toggleRecording}
              title={
                recording
                  ? 'Stop and send your question'
                  : speechRecognitionEngine() === 'argmax'
                    ? 'Ask out loud (transcribed on this computer by Argmax)'
                    : 'Record voice'
              }
              aria-label={recording ? 'Stop recording' : 'Ask out loud'}
              className="btn-ghost"
              disabled={thinking || transcribing}
              style={{
                ...iconBtnStyle(recording),
                opacity: !thinking && !transcribing ? 1 : 0.4,
              }}
            >
              {recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={toggleSpeaker}
            title={speakerOn ? 'Mute tutor audio' : 'Enable tutor audio'}
            className="btn-ghost"
            disabled={!ttsOK}
            style={{
              ...iconBtnStyle(speakerOn, '#1d4ed8'),
              opacity: ttsOK ? 1 : 0.4,
            }}
          >
            {speakerOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      )}

      {voicePanel}
    </>
  )
}
