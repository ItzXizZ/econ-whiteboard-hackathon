import { cancelSpeech } from './voiceTutor'

export interface HintTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface HintRequest {
  /** PNG data URL of the highlighted region the student wants help with. */
  regionImage?: string
  /** PNG data URL of the whole board, for extra context. */
  boardImage?: string
  /**
   * Vector-crisp render of ALL the work with a labeled 0–1000 coordinate grid
   * overlaid — the model picks its highlight boxes visually on this image.
   */
  gridImage?: string
  /** Pasted problem screenshots (original resolution) so the problem is always in context. */
  problemImages?: string[]
  /**
   * Machine-recognized transcript of the handwriting (local Bonsai vision), one entry per
   * line, numbered top-to-bottom. Lets the tutor cite "line n" so the
   * client can glow exactly the strokes behind that line.
   */
  recognizedLines?: { n: number; latex: string }[]
  /** Optional typed question. */
  prompt?: string
  /** Prior hint exchanges (text only) to keep coaching coherent. */
  history?: HintTurn[]
  /** Rung on the fading ladder (1 = orienting … 4 = procedural). */
  hintLevel?: number
  /**
   * hint = Socratic nudge, solve = full solution, voice = spoken (no LaTeX),
   * clarify = short follow-up answer, generalize = the playbook for this
   * problem TYPE ("generally, for problems like this…").
   */
  mode?: 'hint' | 'solve' | 'voice' | 'clarify' | 'generalize'
  apiKey?: string
  boardEmpty?: boolean
  /**
   * Called when the tutor draws a graph for this reply. Not sent to the
   * server; it rides on the request so every caller can opt in.
   */
  onGraph?: (graph: TutorGraphSpec) => void
  onEquations?: (equations: string[]) => void
}

/** A graph the tutor draws, in a unit square (x right, y up). See server/graphDraw.js. */
export interface TutorGraphSpec {
  title: string
  xLabel: string
  yLabel: string
  lines: { label: string; pts: [number, number][]; color: string; dashed?: boolean }[]
  guides?: { x: number; y: number; xText?: string; yText?: string }[]
  areas?: { pts: [number, number][]; label?: string }[]
  ticks?: { axis: 'x' | 'y'; at: number; text: string }[]
  points?: { x: number; y: number; text: string }[]
  caption?: string
}

function isGraphSpec(v: unknown): v is TutorGraphSpec {
  const g = v as TutorGraphSpec
  return !!g && typeof g === 'object' && typeof g.title === 'string' && Array.isArray(g.lines) && g.lines.length > 0
}

/** The tutor reply currently streaming, if any. */
let activeReply: { controller: AbortController; superseded: boolean } | null = null

/** Abort if the server goes silent this long (it sends keep-alives during CPU prefill). */
const IDLE_TIMEOUT_MS = 60000

/** Lines the tutor pointed at mid-stream; the board glows their strokes. */
export interface HintHighlight {
  lines: number[]
  label?: string
}

/**
 * Stream a hint from the local Bonsai tutor. Server-Sent Events:
 * lines of `data: {"text":"..."}` then `data: [DONE]`, plus `data:
 * {"highlight":{"lines":[...],"label":"..."}}` events whenever the tutor
 * refers to a recognized line of the student's work.
 */
export async function streamMathHint(
  req: HintRequest,
  onChunk: (text: string) => void,
  onDone?: () => void,
  onError?: (err: string) => void,
  onHighlight?: (highlight: HintHighlight) => void
): Promise<void> {
  // One tutor at a time: a new request ends the reply still in flight, so two
  // answers never talk over each other or queue behind one another on the model.
  if (activeReply) {
    activeReply.superseded = true
    activeReply.controller.abort()
    cancelSpeech()
  }
  const controller = new AbortController()
  const reply = { controller, superseded: false }
  activeReply = reply
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
  }

  const { onGraph, onEquations, ...body } = req
  try {
    resetIdle()
    const res = await fetch('/api/econ/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      onError?.(err.error || 'Request failed')
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') {
          onDone?.()
          return
        }
        try {
          const parsed = JSON.parse(payload)
          if (parsed.error) {
            onError?.(parsed.error)
            return
          }
          if (Array.isArray(parsed.equations)) {
            const equations = parsed.equations
              .filter((equation: unknown): equation is string => typeof equation === 'string' && equation.length <= 200)
              .slice(0, 8)
            if (equations.length) onEquations?.(equations)
          }
          if (parsed.text) onChunk(parsed.text)
          if (parsed.highlight?.lines?.length) onHighlight?.(parsed.highlight)
          if (isGraphSpec(parsed.graph)) onGraph?.(parsed.graph)
        } catch {
          // ignore partial-chunk parse errors
        }
      }
    }

    onDone?.()
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    if (aborted && reply.superseded) {
      // Replaced by a newer question: finish quietly with whatever was said so far.
      onDone?.()
      return
    }
    onError?.(
      aborted
        ? 'The tutor timed out. Please try again.'
        : err instanceof Error
        ? err.message
        : 'Request failed'
    )
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    if (activeReply === reply) activeReply = null
  }
}
