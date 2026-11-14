/**
 * Econ Coach tutor: hints, questions, solutions and debriefs for the whiteboard,
 * generated entirely by a LOCAL Bonsai-2 model (see server/llm.js).
 *
 * POST /api/econ/hint (alias /api/math/hint) streams Server-Sent Events:
 *   data: {"text":"..."}                              text chunks
 *   data: {"highlight":{"lines":[2],"label":"..."}}   glow recognised lines
 *   data: {"error":"..."}                             failure
 *   data: [DONE]
 *
 * In hint mode the concatenated text is the structured format the client
 * parses:
 *   WHERE: / TYPE: / COMPLETE: / STEP 1: ... [[write|box:x,y,w,h|label]] / STEP 2: ...
 *
 * Design notes for a 4B ternary model on CPU:
 *   - Prompts are short, with one worked example of the exact output format,
 *     and the static system prompt stays cached in a dedicated server slot.
 *   - The model sees TEXT whenever possible (recognised handwriting lines and
 *     a one-time OCR of the pasted problem). Images are only attached when
 *     text is not enough, and always downscaled: image prefill is the
 *     slowest thing this machine does.
 *   - The model's output is never trusted to be well-formed. A stream filter
 *     rebuilds the structured reply (headers, step cap, exactly one write
 *     marker, no markdown, no em dashes, length caps) as it streams.
 */

import crypto from 'crypto'
import sharp from 'sharp'
import {
  BonsaiUnreachableError,
  bonsaiHealth,
  completeBackground,
  imagePart,
  PRIORITY,
  SLOT,
  streamChat,
} from './llm.js'
import { transcribeImage } from './recognize.js'
import { solveLinearMarket, tutorNotes, workShowsAnswer } from './econSolver.js'

const TUTOR = 'Adam'

const HINT_TYPES = ['orienting', 'conceptual', 'strategic', 'procedural', 'corrective']
const LADDER_BY_LEVEL = { 1: 'orienting', 2: 'conceptual', 3: 'strategic', 4: 'procedural' }

/** Small = 1 micro-step, Medium = up to 2, Large = up to 3 (mirrors the client). */
function maxStepsForLevel(level) {
  if (level >= 4) return 3
  if (level === 2) return 2
  return 1
}

// ── Prompts (short on purpose) ──────────────────────────────────────────────

const ECON_REMINDERS = `Economics reminders:
- Equilibrium: set Qd = Qs, solve for P, then put P into either equation for Q.
- Per unit tax t: buyers pay Pb, sellers keep Ps = Pb - t, set Qd(Pb) = Qs(Ps). Tax revenue = t x Q. Deadweight loss = 1/2 x t x (fall in Q).
- Consumer surplus = 1/2 x (demand price intercept - P) x Q. Producer surplus is the area between P and the supply curve.
- Elasticity = % change in quantity / % change in price. Above 1 is elastic.
- Profit is maximised where MR = MC. Perfect competition: P = MC. Monopoly: find Q from MR = MC, then P from the demand curve.
- Costs: ATC = TC / Q, MC is the change in TC from one more unit, MC crosses ATC at its minimum.
- GDP = C + I + G + NX. Real GDP removes inflation. Unemployment rate = unemployed / labor force.
- Spending multiplier = 1 / (1 - MPC). Money multiplier = 1 / reserve ratio.
- Opportunity cost is the next best alternative given up. Comparative advantage goes to the lower opportunity cost.
- Nash equilibrium: no player can gain by changing strategy alone. Check each cell of the payoff matrix for best responses.`

const HINT_SYSTEM = `You are ${TUTOR}, a warm, patient economics tutor. A student is solving a problem by hand on a whiteboard and asked for a hint. Coach them one small step forward. Never reveal the final answer.

You get the PROBLEM, the student's WORK as numbered lines (read by handwriting recognition, so small misreadings are possible), sometimes private TUTOR NOTES with the correct solution path, and a REQUEST.

Reply in exactly this format and nothing else:
WHERE: one short sentence on what the student has done so far
TYPE: orienting, conceptual, strategic, procedural or corrective
COMPLETE: yes or no (yes only if their work already shows the correct final answer)
WRITE: 2 to 5 words naming the one thing they should write next
STEP 1: the hint, 1 or 2 short sentences

Hint types, from gentle to direct:
orienting: point at a given or a line they are overlooking and ask a question
conceptual: name the economic idea the next step needs
strategic: outline the plan for the next step
procedural: say the exact operation to do next, without doing it for them
corrective: use this whenever a line has a mistake. Say which line and what is wrong

Rules:
- Start from the student's last correct line and give only the next small step. Do not solve ahead. Do not state final numbers.
- Use their notation. Point at their work as "line 2".
- End by telling them exactly what to write next.
- Plain text math like Qd = 100 - 2P. No LaTeX, no markdown, no lists.
- If the request asks for 2 steps, add a line "STEP 2:". STEP 1 explains the idea, STEP 2 says what to write.
- If the request is to check what they wrote in the answer box: say whether it is right. If right, praise briefly and give the next thing to write. If wrong, say what is off and ask them to redo it.
- TUTOR NOTES are private. Use them to check the work, never quote their numbers.

${ECON_REMINDERS}

Example
PROBLEM: Demand is Qd = 100 - 2P and supply is Qs = 20 + 2P. Find the equilibrium price and quantity.
WORK:
line 1: Qd = 100 - 2P
line 2: Qs = 20 + 2P
REQUEST: conceptual hint, 1 step
Reply:
WHERE: You wrote the demand and supply equations but have not linked them yet.
TYPE: conceptual
COMPLETE: no
WRITE: Qd = Qs equation
STEP 1: At equilibrium the quantity buyers want equals the quantity sellers offer. Set line 1 equal to line 2 and write that equation.`

const CHAT_SYSTEM = `You are ${TUTOR}, a warm, patient economics tutor talking with a student about the problem on their whiteboard.

You get the PROBLEM, the student's WORK as numbered lines (read by handwriting recognition, so small misreadings are possible), sometimes private TUTOR NOTES, and what the student said.

Rules:
- Answer in 1 or 2 short sentences. Be direct and kind.
- Guide, do not solve: never give the final answer. If they ask whether a number is right, tell them.
- When you point at their work, say which line, for example "line 2".
- Plain text math like Qd = 100 - 2P. No LaTeX, no markdown, no lists.
- TUTOR NOTES are private. Use them to check the work, never quote their numbers.

${ECON_REMINDERS}`

const LONG_SYSTEM = `You are ${TUTOR}, a clear, friendly economics teacher. You write short, well organised explanations in simple markdown.

Rules:
- Plain text math like Qd = 100 - 2P. No LaTeX.
- Keep it short. Every line must earn its place.
- If TUTOR NOTES are given, they contain the correct numbers. Use them.

${ECON_REMINDERS}`

const SOLVE_REQUEST = `The student asked for the full solution. Write it as:
A one line restatement of the problem.
Then 3 to 6 numbered steps, one short line each, showing the working.
Then a last line starting with "**Answer:**" that states the final answer.`

const GENERALIZE_REQUEST = `The student wants the big picture. Write a short debrief with exactly these markdown sections:

## Problem type
One sentence naming the kind of economics problem this is.

## Generally, for problems like this
Start with "Generally," then 3 to 5 numbered steps giving the method that works for every problem of this type.

## Signals to recognize it next time
2 short bullet points.

## Common traps
2 short bullet points.

## One-line takeaway
One memorable sentence.`

const PROBLEM_OCR_PROMPT =
  'This is a screenshot of an economics problem. Transcribe all of its text exactly, keeping equations as plain text. ' +
  'If there is a graph or table, add one sentence describing it with its numbers. Output only that, nothing else.'

const WORK_OCR_PROMPT =
  'This is handwritten work by an economics student. Transcribe each handwritten line exactly as plain text, one line per line, top to bottom. ' +
  'Ignore the light blue grid and its numbers. Output only the transcription.'

// ── Images ──────────────────────────────────────────────────────────────────

/** Vision tokens are roughly one per 32x32 px patch; this bounds prefill time on CPU. */
async function shrinkImage(dataUrl, { maxEdge = 640, maxTokens = 220 } = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s)
  const b64 = m ? m[2] : dataUrl
  if (!b64) return null
  try {
    const input = Buffer.from(b64, 'base64')
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) return null
    let scale = Math.min(1, maxEdge / Math.max(meta.width, meta.height))
    const tokens = (w, h) => Math.ceil(w / 32) * Math.ceil(h / 32)
    while (scale > 0.05 && tokens(meta.width * scale, meta.height * scale) > maxTokens) scale *= 0.9
    const width = Math.max(32, Math.round(meta.width * scale))
    const out = await sharp(input)
      .flatten({ background: '#ffffff' })
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toBuffer()
    return `data:image/png;base64,${out.toString('base64')}`
  } catch (err) {
    console.warn('[tutor] could not read an image:', err?.message)
    return null
  }
}

const problemCache = new Map() // sha1(image) -> text
const problemJobs = new Map()
const PROBLEM_CACHE_MAX = 60

function imageKey(dataUrl) {
  return crypto.createHash('sha1').update(dataUrl).digest('hex')
}

/**
 * Text of a pasted problem screenshot. OCR'd once by the local vision model
 * and cached by image hash, so every later hint on the same problem is
 * text-only (fast). Returns '' when the image cannot be read.
 */
async function problemText(dataUrl, { background = false, signal } = {}) {
  const key = imageKey(dataUrl)
  if (problemCache.has(key)) return problemCache.get(key)
  let job = problemJobs.get(key)
  if (!job) {
    job = (async () => {
      const small = await shrinkImage(dataUrl, { maxEdge: 768, maxTokens: 260 })
      if (!small) return ''
      const raw = await transcribeImage(small, { prompt: PROBLEM_OCR_PROMPT, maxTokens: 220, background })
      const text = String(raw || '')
        .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim()
        .slice(0, 900)
      problemCache.set(key, text)
      if (problemCache.size > PROBLEM_CACHE_MAX) problemCache.delete(problemCache.keys().next().value)
      return text
    })().finally(() => problemJobs.delete(key))
    problemJobs.set(key, job)
  }
  if (!signal) return job
  // Let the caller give up (client disconnected) without cancelling the shared job.
  return Promise.race([
    job,
    new Promise((_, reject) => {
      const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }),
  ])
}

// ── Output cleaning ─────────────────────────────────────────────────────────

const MARKER_RE = /\[\[\s*([a-z]+)\s*\|([^|\]]*)(?:\|([^\]]*))?\]\]/gi

function looksLikeMath(content) {
  const c = content.trim()
  if (!c || c.length > 60) return false
  // "$5 per unit and $" is two currency amounts, not a formula.
  if (/^\d[\d,.]*\s+[A-Za-z]{2,}/.test(c)) return false
  if (/[\\_^={}]/.test(c)) return true
  if (/\b[a-z]{4,}\b/.test(c)) return false
  return /^[\w\s+\-*/().,<>]{1,30}$/.test(c)
}

/** LaTeX the model sometimes emits anyway -> plain text the board can show. */
function latexToPlain(tex) {
  return tex
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\times|\\cdot/g, ' x ')
    .replace(/\\div/g, ' / ')
    .replace(/\\(?:leq?)\b/g, ' <= ')
    .replace(/\\(?:geq?)\b/g, ' >= ')
    .replace(/\\neq?\b/g, ' != ')
    .replace(/\\approx\b/g, ' ~ ')
    .replace(/\\(?:Delta|delta)\b/g, 'change in ')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$')
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/_\{([^{}]*)\}/g, '$1')
    .replace(/_([A-Za-z0-9])/g, '$1')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/\\(?:left|right|quad|qquad)\b|\\[,;!]/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Incremental cleaner for streamed model prose.
 *
 * push(text) returns the part that is safe to show now; anything that might
 * still be the start of a [[marker]], a $math$ span, **bold**, or a field
 * label is held back until it resolves. flush() returns the rest.
 *
 * mode 'prose'    single paragraph: markdown stripped, newlines folded
 * mode 'markdown' keeps headings/lists/bold for the Markdown renderer
 *
 * highlights 'inline'  keep/insert [[highlight|line:n]] markers (hint cards)
 *            'event'   report via onHighlight, strip from text (voice/clarify)
 *            'none'    strip
 */
class ProseCleaner {
  constructor({ mode = 'prose', highlights = 'none', validLines = new Set(), onHighlight } = {}) {
    this.mode = mode
    this.highlights = highlights
    this.validLines = validLines
    this.onHighlight = onHighlight
    this.pending = ''
    this.writeLabel = null
    this.seenLines = new Set()
    this.atStart = true
  }

  /** Index up to which `s` contains no unfinished construct. */
  safeCut(s) {
    let cut = s.length
    const hold = (idx, maxSpan) => {
      if (idx >= 0 && idx < cut && s.length - idx <= maxSpan) cut = idx
    }
    const lastOpen = s.lastIndexOf('[[')
    if (lastOpen !== -1 && s.indexOf(']]', lastOpen) === -1) hold(lastOpen, 200)
    const lastParen = s.lastIndexOf('\\(')
    if (lastParen !== -1 && s.indexOf('\\)', lastParen) === -1) hold(lastParen, 160)
    const lastBracket = s.lastIndexOf('\\[')
    if (lastBracket !== -1 && s.indexOf('\\]', lastBracket) === -1) hold(lastBracket, 200)

    // An odd "$" may open a math span; wait for its partner, a newline, or 60 chars.
    const dollars = [...s.matchAll(/\$/g)].map((m) => m.index)
    if (dollars.length % 2 === 1) {
      const last = dollars[dollars.length - 1]
      if (s.indexOf('\n', last) === -1) hold(last, 60)
    }
    const bold = [...s.matchAll(/\*\*/g)].map((m) => m.index)
    if (bold.length % 2 === 1) hold(bold[bold.length - 1], 160)

    // A single trailing character that may begin a construct ("[[", "\(", "**").
    if (/(?:\[|\\|(?<!\*)\*)$/.test(s)) hold(s.length - 1, 1)
    // "line 1" may still become "line 12".
    const lineRef = s.match(/\b(?:lines?\s*\d{0,2}|l|li|lin)$/i)
    if (lineRef) hold(lineRef.index, 12)
    return cut
  }

  cleanSegment(seg) {
    let s = seg

    // Board markers.
    s = s.replace(MARKER_RE, (_all, roleRaw, target, label) => {
      const role = String(roleRaw).toLowerCase()
      if (role === 'write') {
        const clean = String(label || '').replace(/[|\]\[]/g, '').trim()
        if (clean) this.writeLabel = clean
        return ''
      }
      if (role === 'highlight' || role === 'focus') {
        const lm = String(target).match(/line\s*[:=]?\s*(\d+)/i)
        const n = lm ? Number(lm[1]) : NaN
        return this.noteLine(n, String(label || '').replace(/[|\]\[]/g, '').trim())
      }
      return ''
    })
    s = s.replace(/\[\[[^\]]*\]\]/g, '')

    // Spoken line references ("line 2") light up that line on the board.
    if (this.highlights !== 'none') {
      s = s.replace(/\b(lines?)\s+(\d{1,2})\b(?!\s*\[\[)/gi, (all, _w, num) => {
        const marker = this.noteLine(Number(num), '')
        return marker ? `${all} ${marker}` : all
      })
    }

    // Math delimiters: this board shows plain text.
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_a, body) => latexToPlain(body))
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_a, body) => ` ${latexToPlain(body)} `)
    s = s.replace(/\$\$([^$]+?)\$\$/g, (_a, body) => latexToPlain(body))
    s = s.replace(/\$([^$\n]{1,60}?)\$/g, (all, body) => (looksLikeMath(body) ? latexToPlain(body) : all))

    // A dash between a term and a number is a minus sign; otherwise it is punctuation.
    s = s
      .replace(/\u2212/g, '-')
      .replace(/([\w)])\s*[\u2014\u2013]\s*(?=\d)/g, '$1 - ')
      .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    s = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")

    if (this.mode === 'prose') {
      s = s
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/(^|[\s(])\*(\S[^*\n]*?\S|\S)\*(?=[\s).,!?;:]|$)/g, '$1$2')
        .replace(/`/g, '')
        .replace(/\n\s*#{1,6}\s*/g, '\n')
        // List bullets only right after a real line break: "- 2P" mid-sentence is a minus.
        .replace(/\n\s*(?:[*\u2022]|-(?=\s+[A-Za-z]{2})|\d+[.)](?=\s+[A-Za-z]))\s+/g, '\n')
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/;/g, ',')
        .replace(/[ \t]{2,}/g, ' ')
    } else {
      s = s.replace(/[ \t]{2,}/g, ' ')
    }
    if (this.atStart) {
      s = s.replace(/^[\s#]+/, '')
      if (s) this.atStart = false
    } else if (this.lastSpace && this.mode === 'prose') {
      s = s.replace(/^[ \t]+/, '')
    }
    if (s) this.lastSpace = /[ \t]$/.test(s)
    return s
  }

  /** Record a referenced transcript line; returns the inline marker text (or ''). */
  noteLine(n, label) {
    if (!Number.isInteger(n) || !this.validLines.has(n)) return ''
    if (this.highlights === 'none') return ''
    const first = !this.seenLines.has(n)
    this.seenLines.add(n)
    if (this.highlights === 'event') {
      if (first) this.onHighlight?.({ lines: [n], ...(label ? { label: label.slice(0, 40) } : {}) })
      return ''
    }
    // inline: one marker per line per step keeps the board calm.
    if (!first) return ''
    return label ? `[[highlight|line:${n}|${label.slice(0, 40)}]]` : `[[highlight|line:${n}]]`
  }

  push(text) {
    this.pending += text
    const cut = this.safeCut(this.pending)
    const seg = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return seg ? this.cleanSegment(seg) : ''
  }

  flush() {
    let seg = this.pending
    this.pending = ''
    // A marker cut off by the token limit is debris, not text.
    const open = seg.lastIndexOf('[[')
    if (open !== -1 && seg.indexOf(']]', open) === -1) seg = seg.slice(0, open)
    seg = seg.replace(/[[\\]$/, '')
    return seg ? this.cleanSegment(seg) : ''
  }
}

function sentenceCount(text) {
  return (text.match(/[.!?]+(?=\s|$)/g) || []).length
}

/** Cut `text` to at most `max` characters, ending on a sentence when possible. */
function capSentences(text, max) {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
  return end > max * 0.4 ? head.slice(0, end + 1) : `${head.replace(/\s+\S*$/, '')}.`
}

const WRITE_BOX = 'box:150,520,500,150'

function sanitizeLabel(label) {
  const clean = String(label || '')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[|\]\[\n\r*`#"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim()
  if (!clean) return ''
  return clean.length > 44 ? `${clean.slice(0, 44).replace(/\s+\S*$/, '')}` : clean
}

function guessWriteLabel(stepText) {
  const m = stepText.match(/\bwrite\s+(?:down\s+|out\s+)?([\s\S]{3,60}?)(?:[.!?]|$)/i)
  return sanitizeLabel(m?.[1] ?? '')
}

const LABEL_RE = /(^|\s)[*#\s]*\b(WHERE|TYPE|COMPLETE|WRITE|SAY|HINT|STEP\s*\d+)[\s*]*:/g
/** Trailing text that could still turn into a label, or is only decoration/whitespace. */
const TAIL_HOLD_RE = /(?:(?:^|\s)[*#\s]*[A-Z]{1,8}(?:\s*\d{0,2})?[\s*]*:?[\s*]*|[\s*#]+)$/

/**
 * Rebuilds the structured hint reply from whatever the model streams.
 *
 * Feed raw deltas with push(); it returns canonical client-format text to send
 * (possibly ''). Call end() once for the tail. Guarantees:
 *   - WHERE / TYPE / COMPLETE headers are always present and valid
 *   - at most `stepCap` STEP fields, each cleaned and length-capped
 *   - exactly one [[write|box:...|label]] marker, at the end of STEP 1
 *     (the step the student sees first), unless the problem is COMPLETE
 *   - never an empty reply
 */
class HintStream {
  constructor({ targetType, stepCap, validLines, forceComplete = null, allowWrite = true, fallbackLabel = 'your next line' }) {
    this.targetType = targetType
    this.stepCap = stepCap
    this.validLines = validLines
    this.forceComplete = forceComplete
    this.allowWrite = allowWrite
    this.fallbackLabel = fallbackLabel
    this.raw = ''
    this.headerSent = false
    this.complete = false
    this.type = targetType
    this.steps = [] // { cleaner, fed, text, closed, capped }
    this.markerSent = false
    this.inlineLabel = null
  }

  /** Split the accumulated raw text into ordered fields. */
  fields(final) {
    // "Where:" / "Step 1:" at the start of a line count as labels too (same length, so offsets hold).
    const raw = this.raw.replace(
      /(^|\n)([*#\s]*)(where|type|complete|write|step(?=\s*\d))(?=[\s*\d]*:)/gi,
      (_all, nl, deco, word) => nl + deco + word.toUpperCase()
    )
    const marks = []
    for (const m of raw.matchAll(LABEL_RE)) {
      const name = m[2].toUpperCase()
      marks.push({
        name: name.startsWith('STEP') || name === 'SAY' || name === 'HINT' ? 'STEP' : name,
        start: m.index + m[1].length,
        valueStart: m.index + m[0].length,
      })
    }
    // While a field is still streaming, its tail may be the start of the next
    // label ("\nSTE", "**", "WRITE") rather than content: keep that part back.
    const settle = (value, closed) => {
      let v = value.replace(/^[\s*#]+/, '')
      if (!closed) v = v.replace(TAIL_HOLD_RE, '')
      return v
    }
    const out = []
    // Text before any label: the model skipped the format. Treat it as the hint itself.
    const leadClosed = marks.length > 0 || final
    const lead = settle(marks.length ? raw.slice(0, marks[0].start) : raw, leadClosed)
    const committed = this.steps[0]?.implicit
    if (lead && (committed || leadClosed || (lead.length >= 14 && !/^(where|type|complete|write|step|say|hint)\b/i.test(lead)))) {
      out.push({ name: 'STEP', value: lead, closed: leadClosed, implicit: true })
    }
    marks.forEach((mk, i) => {
      const closed = i + 1 < marks.length || final
      const end = i + 1 < marks.length ? marks[i + 1].start : raw.length
      out.push({ name: mk.name, value: settle(raw.slice(mk.valueStart, end), closed), closed })
    })
    return out
  }

  header(fields) {
    const get = (name) => fields.find((f) => f.name === name)?.value.trim() ?? ''
    const where = capSentences(
      new ProseCleaner().cleanSegment(get('WHERE')).replace(/\s+/g, ' ').trim() || 'Reading the work on the board.',
      220
    )
    const typeRaw = get('TYPE').toLowerCase().match(/[a-z]+/)?.[0] ?? ''
    // The rung comes from the hint size the student picked; the model may only
    // override it to flag a mistake.
    this.type = typeRaw === 'corrective' ? 'corrective' : this.targetType
    const completeRaw = /^\s*(yes|true)\b/i.test(get('COMPLETE'))
    this.complete = this.forceComplete === null ? completeRaw : this.forceComplete && completeRaw
    return `WHERE:\nStrategy: ${where}\nStep: ${where}\n\nTYPE: ${this.type}\n\nCOMPLETE: ${this.complete ? 'yes' : 'no'}\n\n`
  }

  writeMarker(fields, stepText) {
    if (this.markerSent || this.complete || !this.allowWrite) return ''
    this.markerSent = true
    const fromField = sanitizeLabel(fields.find((f) => f.name === 'WRITE')?.value ?? '')
    const label =
      fromField || sanitizeLabel(this.inlineLabel) || guessWriteLabel(stepText) || this.fallbackLabel
    return ` [[write|${WRITE_BOX}|${label}]]`
  }

  process(final) {
    const fields = this.fields(final)
    const stepFields = fields.filter((f) => f.name === 'STEP' && (f.value.trim() || f.closed))
    let out = ''

    if (!this.headerSent) {
      // Hold the header until the hint text starts (or the stream ends), so
      // TYPE / COMPLETE are complete before they are committed.
      if (!stepFields.length && !final) return ''
      out += this.header(fields)
      this.headerSent = true
    }

    const usable = stepFields.filter((f) => f.value.trim()).slice(0, this.stepCap)
    let firstEnd = -1 // offset in `out` where STEP 1's text ends, when it closes in this call
    usable.forEach((f, i) => {
      let st = this.steps[i]
      if (!st) {
        st = this.steps[i] = {
          cleaner: new ProseCleaner({
            mode: 'prose',
            highlights: this.validLines.size ? 'inline' : 'none',
            validLines: this.validLines,
          }),
          implicit: !!f.implicit,
          fed: 0,
          text: '',
          closed: false,
          capped: false,
        }
        out += `${i === 0 ? '' : '\n'}STEP ${i + 1}: `
      }
      if (st.closed) return
      const fresh = f.value.length > st.fed ? f.value.slice(st.fed) : ''
      st.fed = Math.max(st.fed, f.value.length)
      let piece = fresh ? st.cleaner.push(fresh) : ''
      if (f.closed) {
        piece += st.cleaner.flush()
        st.closed = true
      }
      if (st.cleaner.writeLabel) this.inlineLabel = st.cleaner.writeLabel
      if (piece && !st.capped) {
        // Hard length cap per step: finish the sentence in progress, then stop.
        const room = 360 - st.text.length
        if (piece.length > room) {
          const cutAt = piece.slice(0, Math.max(0, room)).search(/[.!?](?=\s|$)/)
          piece = cutAt >= 0 ? piece.slice(0, cutAt + 1) : piece.slice(0, Math.max(0, room)).replace(/\s+\S*$/, '') + '.'
          st.capped = true
        }
        st.text += piece
        out += piece
      }
      if (i === 0 && st.closed) firstEnd = out.length
    })

    // The write box rides on STEP 1 (the step the student sees first). Emit it
    // once STEP 1 is finished and the WRITE label, if any, is fully known.
    const first = this.steps[0]
    if (first?.closed && !this.markerSent) {
      const writeField = fields.find((f) => f.name === 'WRITE')
      const writeReady = !writeField || writeField.closed
      if (writeReady) {
        const marker = this.writeMarker(fields, first.text.trim())
        if (firstEnd >= 0) {
          // STEP 1 finished in this very chunk: the marker goes right after it.
          out = out.slice(0, firstEnd).replace(/\s+$/, '') + marker + out.slice(firstEnd)
        } else if (this.steps.length === 1) {
          out = out.replace(/\s+$/, '') + marker
        } else {
          // Later steps are already on the wire; send it at the very end and
          // let the client move it onto the visible step.
          this.lateMarker = marker
        }
      }
    }

    if (final) {
      if (!this.steps.length || !this.steps.some((s) => s.text.trim())) {
        // Never blank: a blank reply makes the client fire a second, slow request.
        const fallback = this.complete
          ? 'Great work, this problem is fully solved!'
          : 'I could not make out enough of your work yet. Write the next line of your solution, or type what you have tried so far.'
        out += `STEP 1: ${fallback}${this.writeMarker(fields, fallback)}`
      } else if (this.lateMarker) {
        // STEP 1 closed while the label was still unknown and later steps
        // followed: the client moves a trailing marker onto the visible step.
        out += this.lateMarker
        this.lateMarker = ''
      }
    }
    return out
  }

  push(delta) {
    this.raw += delta
    return this.process(false)
  }

  end() {
    return this.process(true)
  }
}

// ── Request understanding ───────────────────────────────────────────────────

/** Detect whether the student is asking for a full solution vs. a hint. */
function wantsFullSolution(prompt) {
  const p = String(prompt || '').toLowerCase()
  return /\b(full\s+solution|solve\s+it|solve\s+this|final\s+answer|just\s+tell\s+me|complete\s+solution|work\s+it\s+out|show\s+(me\s+)?the\s+(full\s+)?(solution|answer|work))\b/.test(
    p
  )
}

/** Prompts the client generates itself (not typed by the student). */
const CLIENT_TEMPLATE_RE =
  /^(Read my work first|Re-read my latest work|FOLLOW-UP NUDGE|REEXPLAIN STEP|I tapped the check mark|Please show the full|I want the big picture|Clarifying question about your last hint)/i

function classify(body) {
  const mode = body.mode
  const prompt = String(body.prompt || '').replace(/\s+REMINDER:[\s\S]*$/i, '').trim()
  const voice = mode === 'voice'
  const clarify = mode === 'clarify'
  const generalize = mode === 'generalize'
  const solve = !voice && !clarify && !generalize && (mode === 'solve' || wantsFullSolution(prompt))
  const structured = !voice && !clarify && !generalize && !solve
  const reexplain = structured && /^REEXPLAIN STEP:/i.test(prompt)
  const followUpM = structured && !reexplain ? /FOLLOW-UP NUDGE #(\d+)/i.exec(prompt) : null
  const check = structured && !reexplain && /tapped the check mark/i.test(prompt)

  let kind = 'hint'
  if (voice) kind = 'voice'
  else if (clarify) kind = 'clarify'
  else if (generalize) kind = 'generalize'
  else if (solve) kind = 'solve'
  else if (reexplain) kind = 'reexplain'
  else if (check) kind = 'check'
  else if (followUpM) kind = 'followup'

  let studentText = ''
  if (voice) studentText = prompt
  else if (clarify) studentText = prompt.replace(/^Clarifying question about your last hint:\s*/i, '')
  else if (!CLIENT_TEMPLATE_RE.test(prompt)) studentText = prompt

  const confusing = reexplain ? (prompt.match(/last hint:\s*"([\s\S]*?)"\.\s*Re-explain/i)?.[1] ?? '') : ''
  const boxLabel = check ? (prompt.match(/\("([^"]{1,80})"\)/)?.[1] ?? '') : ''

  return {
    kind,
    nudge: followUpM ? Number(followUpM[1]) : 0,
    studentText: studentText.slice(0, 500),
    confusing,
    boxLabel,
  }
}

/** Visible tutor prose from a previous structured reply (for "do not repeat" context). */
function proseOf(assistantText) {
  const t = String(assistantText || '')
  const i = t.search(/STEP\s*1\s*:/i)
  const body = i >= 0 ? t.slice(i) : t
  return body
    .replace(/STEP\s*\d+\s*:\s*/gi, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/(?:WHERE|TYPE|COMPLETE|WRITE|Strategy|Step)\s*:[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lastTutorProse(history) {
  if (!Array.isArray(history)) return ''
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (m && m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      return proseOf(m.content).slice(0, 420)
    }
  }
  return ''
}

function transcriptOf(recognizedLines) {
  return (Array.isArray(recognizedLines) ? recognizedLines : [])
    .filter((l) => l && Number.isInteger(l.n) && l.n > 0 && typeof l.latex === 'string' && l.latex.trim())
    .slice(0, 30)
    .map((l) => ({ n: l.n, text: l.latex.replace(/\s+/g, ' ').trim().slice(0, 120) }))
}

// ── SSE plumbing ────────────────────────────────────────────────────────────

function openSse(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  // Comment frames keep the client's idle timer alive during slow CPU prefill.
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': thinking\n\n')
  }, 5000)
  return {
    text: (t) => {
      if (t && !res.writableEnded) res.write(`data: ${JSON.stringify({ text: t })}\n\n`)
    },
    highlight: (h) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ highlight: h })}\n\n`)
    },
    error: (message) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    },
    done: () => {
      clearInterval(ping)
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n')
        res.end()
      }
    },
    close: () => {
      clearInterval(ping)
      if (!res.writableEnded) res.end()
    },
  }
}

// ── The endpoint ────────────────────────────────────────────────────────────

async function handleHint(req, res) {
  const body = req.body || {}
  const { regionImage, boardImage, gridImage, problemImages, recognizedLines, history, hintLevel } = body
  const level = Math.min(Math.max(Number(hintLevel) || 1, 1), 4)

  if (!regionImage && !boardImage && !gridImage && !body.prompt) {
    return res.status(400).json({ error: 'Highlight some work or type a question first.' })
  }

  const sse = openSse(res)
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
  const started = Date.now()
  let firstTextAt = 0

  try {
    if (!(await bonsaiHealth({ maxAgeMs: 3000 }))) throw new BonsaiUnreachableError()

    const req_ = classify(body)
    const transcript = transcriptOf(recognizedLines)
    const validLines = new Set(transcript.map((l) => l.n))

    // 1) The problem statement: OCR each pasted screenshot once, then reuse the text.
    const problems = (Array.isArray(problemImages) ? problemImages : [])
      .filter((p) => typeof p === 'string' && p.length > 64)
      .slice(0, 2)
    const problemParts = []
    for (const img of problems) {
      const text = await problemText(img, { signal: abort.signal }).catch((err) => {
        if (err?.name === 'AbortError' || err instanceof BonsaiUnreachableError) throw err
        console.warn('[tutor] problem OCR failed:', err?.message)
        return ''
      })
      if (text) problemParts.push(text)
    }
    const problem = problemParts.join('\n').trim()

    // 2) The student's work: recognised lines when we have them, else one small image.
    const workText = transcript.map((l) => `line ${l.n}: ${l.text}`).join('\n')
    const images = []
    let workNote = ''
    if (req_.kind === 'check' && regionImage) {
      // Verdict on an answer box: the crop of exactly that box is ground truth.
      const img = await shrinkImage(regionImage, { maxEdge: 512, maxTokens: 130 })
      if (img) {
        images.push(img)
        workNote = 'The attached image is the answer box the student just wrote in. Read it carefully first.'
      }
    } else if (!transcript.length) {
      const source = gridImage || regionImage || boardImage
      const img = source ? await shrinkImage(source, { maxEdge: 640, maxTokens: 200 }) : null
      if (img) {
        images.push(img)
        workNote = gridImage
          ? "The attached image is the student's handwritten work (ignore the light blue grid and its numbers)."
          : "The attached image is the student's handwritten work."
      }
    }

    // 3) Ground the small model with the worked numbers when the problem is one we can solve exactly.
    const solution = solveLinearMarket(problem, `${workText}\n${req_.studentText}`)
    const notes = tutorNotes(solution)

    const sections = []
    sections.push(`PROBLEM: ${problem || '(no problem text was pasted; infer it from the work)'}`)
    if (workText) sections.push(`WORK:\n${workText}`)
    else if (workNote) sections.push(`WORK: ${workNote}`)
    else sections.push('WORK: (nothing readable yet)')
    if (workText && workNote) sections.push(workNote)
    if (notes) sections.push(`TUTOR NOTES (private):\n${notes}`)

    const previous = lastTutorProse(history)
    const kind = req_.kind
    let system
    let slot
    let maxTokens
    let temperature = 0.4
    let run

    const userMessage = (text) => ({
      role: 'user',
      content: images.length ? [...images.map(imagePart), { type: 'text', text }] : text,
    })

    if (kind === 'hint' || kind === 'followup' || kind === 'check') {
      const target = LADDER_BY_LEVEL[level] || 'orienting'
      const stepCap = kind === 'hint' ? maxStepsForLevel(level) : 1
      const wantSteps = Math.min(stepCap, 2)
      if (previous && kind !== 'hint') sections.push(`YOUR LAST HINT: ${previous}`)
      if (req_.studentText) sections.push(`STUDENT SAYS: ${req_.studentText}`)
      let request
      if (kind === 'check') {
        request = `check what the student wrote in the answer box${req_.boxLabel ? ` (you asked for: ${req_.boxLabel})` : ''}, 1 step. In WHERE, quote exactly what they wrote.`
      } else if (kind === 'followup') {
        request = `another ${target} hint, 1 step. Do not repeat your last hint. Go one small notch further.`
      } else {
        request = `${target} hint, ${wantSteps} step${wantSteps > 1 ? 's' : ''}`
      }
      sections.push(`REQUEST: ${request}\nReply:`)

      system = HINT_SYSTEM
      slot = SLOT.hint
      maxTokens = wantSteps > 1 ? 200 : 150
      const stream = new HintStream({
        targetType: target,
        stepCap,
        validLines,
        // With a solved reference, "COMPLETE: yes" is only believed when the
        // final numbers really are on the board.
        forceComplete: solution && transcript.length ? workShowsAnswer(solution, workText) : null,
      })
      run = {
        onText: (delta) => stream.push(delta),
        onEnd: () => stream.end(),
      }
    } else if (kind === 'voice' || kind === 'clarify' || kind === 'reexplain') {
      if (previous) sections.push(`YOUR LAST HINT: ${previous}`)
      if (kind === 'reexplain') {
        sections.push(
          `The student is confused by this part of your hint: "${req_.confusing.replace(/\[\[[^\]]*\]\]/g, '').slice(0, 300)}"\nExplain that same idea again in a different, simpler way in 1 or 2 short sentences. Do not add a new step and do not ask them to write anything.`
        )
      } else {
        sections.push(
          `STUDENT ${kind === 'clarify' ? 'ASKS' : 'SAYS'}: ${req_.studentText || 'Help me with the very next step from where I am.'}`
        )
      }
      system = CHAT_SYSTEM
      slot = SLOT.chat
      maxTokens = 110
      const cleaner = new ProseCleaner({
        mode: 'prose',
        highlights: kind === 'reexplain' ? 'none' : validLines.size ? 'event' : 'none',
        validLines,
        onHighlight: (h) => sse.highlight(h),
      })
      let shown = ''
      let prefixSent = kind !== 'reexplain'
      const emit = (piece) => {
        if (!piece) return ''
        piece = piece.replace(/^(?:SAY|ANSWER|REPLY|STEP\s*\d+)\s*:\s*/i, '')
        shown += piece
        if (!prefixSent) {
          prefixSent = true
          return `STEP 1: ${piece}`
        }
        return piece
      }
      run = {
        onText: (delta) => emit(cleaner.push(delta)),
        onEnd: () => {
          let tail = emit(cleaner.flush())
          if (!shown.trim()) {
            tail = kind === 'reexplain' ? '' : "I did not quite get that. Could you ask it another way?"
          }
          return tail
        },
        // Spoken answers stay short: stop generating once three sentences are out.
        shouldStop: () => sentenceCount(shown) >= 3 && shown.length > 60,
      }
    } else {
      // solve / generalize: short markdown
      if (req_.studentText && kind === 'solve') sections.push(`STUDENT SAYS: ${req_.studentText}`)
      sections.push(kind === 'solve' ? SOLVE_REQUEST : GENERALIZE_REQUEST)
      system = LONG_SYSTEM
      slot = SLOT.long
      maxTokens = kind === 'solve' ? 380 : 420
      temperature = 0.3
      const cleaner = new ProseCleaner({ mode: 'markdown' })
      let shown = ''
      run = {
        onText: (delta) => {
          const piece = cleaner.push(delta)
          shown += piece
          return piece
        },
        onEnd: () => {
          const tail = cleaner.flush()
          shown += tail
          return shown.trim() ? tail : 'I could not read the problem well enough to write this up. Try pasting the problem again.'
        },
      }
    }

    const messages = [{ role: 'system', content: system }, userMessage(sections.join('\n\n'))]

    const result = await streamChat({
      messages,
      maxTokens,
      temperature,
      slot,
      priority: PRIORITY.interactive,
      signal: abort.signal,
      onText: (delta) => {
        const out = run.onText(delta)
        if (out) {
          if (!firstTextAt) firstTextAt = Date.now()
          sse.text(out)
        }
        if (run.shouldStop?.()) return false
      },
    })
    const tail = run.onEnd()
    if (tail) sse.text(tail)

    const t = result.timings
    console.log(
      `[tutor] ${kind} L${level} ${images.length ? `img x${images.length}` : 'text'} ` +
        `ttft ${(((firstTextAt || Date.now()) - started) / 1000).toFixed(1)}s total ${((Date.now() - started) / 1000).toFixed(1)}s` +
        (t ? ` | prompt ${t.prompt_n} tok (cached ${t.cache_n ?? 0}) gen ${t.predicted_n} tok @ ${t.predicted_per_second?.toFixed(1)} t/s` : '') +
        (result.finishReason === 'length' ? ' | hit max_tokens' : '')
    )
    sse.done()
  } catch (err) {
    if (abort.signal.aborted) return sse.close()
    console.warn('[tutor] request failed:', err?.message)
    sse.error(
      err instanceof BonsaiUnreachableError
        ? err.message
        : 'The local tutor model hit a problem. Please try again.'
    )
    sse.done()
  }
}

/**
 * Pre-read a pasted problem screenshot in the background so the first hint
 * does not have to wait for it. POST { image } -> { ok, text? }
 */
async function handleProblem(req, res) {
  const image = req.body?.image
  if (typeof image !== 'string' || image.length < 64) {
    return res.status(400).json({ error: 'Missing image.' })
  }
  if (!(await bonsaiHealth({ maxAgeMs: 4000 }))) {
    return res.status(503).json({ error: 'The local Bonsai model is not running.' })
  }
  try {
    const text = await problemText(image, { background: true })
    res.json({ ok: true, text })
  } catch (err) {
    console.warn('[tutor] problem pre-read failed:', err?.message)
    if (!res.headersSent) res.status(503).json({ error: 'Could not read the problem yet.' })
  }
}

export function registerTutorRoutes(app) {
  for (const p of ['/api/econ/hint', '/api/math/hint']) app.post(p, handleHint)
  app.post('/api/econ/problem', handleProblem)
}

/**
 * Put each static system prompt into its llama-server slot's prompt cache so
 * the first real request skips ~15-20 s of CPU prefill.
 */
export function warmTutorCaches() {
  const jobs = [
    [HINT_SYSTEM, SLOT.hint],
    [CHAT_SYSTEM, SLOT.chat],
    [LONG_SYSTEM, SLOT.long],
  ]
  void (async () => {
    for (const [system, slot] of jobs) {
      try {
        const t0 = Date.now()
        await completeBackground({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: 'PROBLEM: (warm-up)' },
          ],
          maxTokens: 1,
          temperature: 0,
          slot,
        })
        console.log(`  warm-up: slot ${slot} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      } catch (err) {
        console.warn('  warm-up skipped:', err?.message)
        return
      }
    }
  })()
}

// Exposed for scripts/selftest.mjs
export const __test = { HintStream, ProseCleaner, classify, proseOf, WORK_OCR_PROMPT }
