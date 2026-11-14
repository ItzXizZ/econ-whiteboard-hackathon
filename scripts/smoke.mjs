/**
 * End-to-end API smoke test against a running Econ Coach server
 * (npm run dev, or node server.js) and a running local Bonsai model.
 *
 *   node scripts/smoke.mjs                 everything
 *   node scripts/smoke.mjs accounts        just accounts + boards
 *   node scripts/smoke.mjs recognize       handwriting recognition accuracy + latency
 *   node scripts/smoke.mjs hints           every tutor mode, with latencies
 *   node scripts/smoke.mjs hints voice     only the named tutor modes
 *
 * Env: SMOKE_BASE (default http://127.0.0.1:3002)
 */
import sharp from 'sharp'
import { linesToStrokes, strokesToSvg, textToStrokes, toRecognizePayload } from './strokeFont.mjs'

const BASE = (process.env.SMOKE_BASE || 'http://127.0.0.1:3002').replace(/\/+$/, '')
const args = process.argv.slice(2)
const sections = ['accounts', 'recognize', 'hints']
const wanted = args.filter((a) => sections.includes(a))
const only = args.filter((a) => !sections.includes(a))
const run = (name) => wanted.length === 0 || wanted.includes(name)

let failures = 0
function ok(cond, label, detail = '') {
  if (cond) console.log(`  ok    ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`)
  }
}
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* not json */
  }
  return { status: res.status, json }
}

// ── Accounts + boards ───────────────────────────────────────────────────────

async function testAccounts() {
  console.log('\nAccounts and boards (local JSON store)')
  const username = `smoke_${Date.now().toString(36)}`.slice(0, 20)
  const password = 'correct horse'

  let r = await api('POST', '/api/econ/register', { body: { username, password } })
  ok(r.status === 200 && r.json?.token && r.json?.username === username, 'register', JSON.stringify(r.json))
  const token = r.json?.token

  r = await api('POST', '/api/econ/register', { body: { username, password } })
  ok(r.status === 409, 'duplicate username is rejected', `status ${r.status}`)

  r = await api('POST', '/api/econ/login', { body: { username, password: 'wrong-password' } })
  ok(r.status === 401, 'wrong password is rejected', `status ${r.status}`)

  r = await api('POST', '/api/econ/login', { body: { username, password } })
  ok(r.status === 200 && r.json?.token, 'login')

  r = await api('GET', '/api/econ/me', { token })
  ok(r.status === 200 && r.json?.username === username, 'me')

  r = await api('GET', '/api/econ/boards')
  ok(r.status === 401, 'boards require a session', `status ${r.status}`)

  const boardId = `econ-${username}-${crypto.randomUUID()}`
  r = await api('POST', '/api/econ/boards', { token, body: { id: boardId, name: 'Supply and demand' } })
  ok(r.status === 200 && r.json?.board?.id === boardId, 'create board', JSON.stringify(r.json))

  const { strokes } = linesToStrokes(['Q_d = 100 - 2P', 'Q_s = 20 + 2P'])
  const snapshot = { strokes: strokes.map((s) => ({ ...s, color: '#1e293b', width: 3 })), viewport: { x: 0, y: 0, zoom: 1 }, savedAt: 2000 }
  r = await api('PUT', `/api/econ/boards/${encodeURIComponent(boardId)}`, { token, body: { name: 'Supply and demand', data: snapshot } })
  ok(r.status === 200 && r.json?.ok === true && !r.json?.skipped, 'save snapshot with strokes', JSON.stringify(r.json))

  r = await api('PUT', `/api/econ/boards/${encodeURIComponent(boardId)}`, { token, body: { data: { strokes: [], savedAt: 1000 } } })
  ok(r.status === 200 && r.json?.skipped === 'stale', 'stale snapshot is rejected', JSON.stringify(r.json))

  r = await api('GET', `/api/econ/boards/${encodeURIComponent(boardId)}`, { token })
  ok(r.status === 200 && r.json?.board?.data?.strokes?.length === strokes.length, 'load snapshot back', `strokes ${r.json?.board?.data?.strokes?.length}`)

  r = await api('GET', '/api/econ/boards', { token })
  ok(r.status === 200 && r.json?.boards?.some((b) => b.id === boardId), 'list boards')

  r = await api('DELETE', `/api/econ/boards/${encodeURIComponent(boardId)}`, { token })
  ok(r.status === 200, 'delete board')

  r = await api('POST', '/api/econ/logout', { token })
  ok(r.status === 200, 'logout')
  r = await api('GET', '/api/econ/me', { token })
  ok(r.status === 401, 'session is gone after logout', `status ${r.status}`)
}

// ── Recognition ─────────────────────────────────────────────────────────────

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[_\s{}]/g, '')
    .replace(/[\u2212\u2013]/g, '-')

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

async function recognize(strokes) {
  const t0 = Date.now()
  const r = await api('POST', '/api/econ/recognize', { body: toRecognizePayload(strokes) })
  return { ...r, ms: Date.now() - t0 }
}

async function testRecognize() {
  console.log('\nHandwriting recognition (synthetic pen strokes, local vision model)')

  // The headline case from the task: one handwritten line.
  const single = textToStrokes('Q_d = 100 - 2P', { x: 140, y: 160, height: 48, seed: 11 })
  let r = await recognize(single)
  const text = r.json?.lines?.[0]?.text
  console.log(`  "Qd = 100 - 2P"  ->  "${text}"   (${secs(r.ms)}, ${r.json?.lines?.length} line)`)
  ok(r.status === 200 && r.json?.lines?.length === 1, 'one line detected', JSON.stringify(r.json)?.slice(0, 200))
  ok(norm(text) === norm('Qd=100-2P'), 'transcription matches exactly', `got "${text}"`)
  ok(r.json?.lines?.[0]?.strokeIds?.length === single.length, 'all stroke ids returned for the line')

  r = await recognize(single)
  console.log(`  same ink again (cache)  ->  ${secs(r.ms)}`)
  ok(r.ms < 1500 && r.json?.lines?.[0]?.text === text, 'repeat request is served from the cache')

  // A small board: several lines, different sizes and seeds.
  const truth = ['Q_d = 100 - 2P', 'Q_s = 20 + 2P', '100 - 2P = 20 + 2P', '80 = 4P', 'P = 20', 'Q = 60']
  let total = 0
  let errors = 0
  let exact = 0
  let lineCount = 0
  const times = []
  for (const [i, height] of [34, 46, 60].entries()) {
    const { strokes, lines } = linesToStrokes(truth, { x: 120, y: 100, height, seed: 20 + i })
    const res = await recognize(strokes)
    times.push(res.ms)
    const got = res.json?.lines ?? []
    ok(got.length === truth.length, `height ${height}px: ${truth.length} lines detected`, `got ${got.length}`)
    truth.forEach((t, li) => {
      // Match by stroke membership, not by order, so a clustering slip is visible.
      const ids = new Set(lines[li])
      const line = got.find((g) => g.strokeIds.some((id) => ids.has(id)))
      const want = norm(t)
      const have = norm(line?.text)
      const dist = editDistance(want, have)
      total += want.length
      errors += Math.min(dist, want.length)
      lineCount++
      if (dist === 0) exact++
      else console.log(`        ${height}px  want "${t.replace('_', '')}"  got "${line?.text}"`)
    })
    console.log(`  height ${height}px: ${got.length} lines in ${secs(res.ms)} (${secs(res.ms / Math.max(1, got.length))} per new line)`)
  }
  const cer = errors / total
  console.log(`  exact lines ${exact}/${lineCount}, character error rate ${(cer * 100).toFixed(1)}%`)
  ok(cer < 0.15, 'character error rate under 15%', `${(cer * 100).toFixed(1)}%`)

  r = await api('POST', '/api/econ/recognize', { body: { strokes: [] } })
  ok(r.status === 400, 'empty request is a 400, never a 501', `status ${r.status}`)
  return { firstLineMs: times[0] }
}

// ── Hints ───────────────────────────────────────────────────────────────────

const PROBLEM =
  'In the market for coffee, demand is Qd = 100 - 2P and supply is Qs = 20 + 2P, where P is the price in dollars. Find the equilibrium price and quantity.'

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A typed problem screenshot, like one pasted onto the board. */
async function problemPng() {
  const words = PROBLEM.split(' ')
  const rows = []
  let row = ''
  for (const w of words) {
    if ((row + ' ' + w).length > 52) {
      rows.push(row)
      row = w
    } else row = row ? `${row} ${w}` : w
  }
  rows.push(row)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${40 + rows.length * 30}"><rect width="100%" height="100%" fill="#fff"/>${rows
    .map((t, i) => `<text x="20" y="${44 + i * 30}" font-family="Georgia, serif" font-size="22" fill="#111">${escapeXml(t)}</text>`)
    .join('')}</svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

/** The board as the client would capture it: handwritten-looking ink on white. */
async function boardPng(strokes, { width = 900, height = 520 } = {}) {
  const png = await sharp(Buffer.from(strokesToSvg(strokes, { width, height }))).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function hint(body) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/econ/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) return { status: res.status, text: '', error: `HTTP ${res.status}`, highlights: [], ttft: 0, total: Date.now() - t0 }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  let error = null
  let done = false
  let ttft = 0
  const highlights = []
  let malformed = 0
  for (;;) {
    const { done: end, value } = await reader.read()
    if (end) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '')
      buf = buf.slice(i + 1)
      if (!line.startsWith('data: ')) continue // comments / blank lines, exactly like the client
      const payload = line.slice(6)
      if (payload === '[DONE]') {
        done = true
        continue
      }
      try {
        const j = JSON.parse(payload)
        if (j.text) {
          if (!ttft) ttft = Date.now() - t0
          text += j.text
        }
        if (j.highlight) highlights.push(j.highlight)
        if (j.error) error = j.error
      } catch {
        malformed++
      }
    }
  }
  return { status: res.status, text, error, highlights, done, malformed, ttft, total: Date.now() - t0 }
}

/** Same parsing rules as the client's parseHintResponse(). */
function parseHint(acc) {
  const type = acc.match(/TYPE:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? null
  const complete = acc.match(/COMPLETE:\s*(yes|true|no|false)/i)?.[1]?.toLowerCase() ?? null
  const where = acc.match(/WHERE:\s*([\s\S]*?)(?=\n\s*TYPE:)/i)?.[1]?.trim() ?? ''
  const first = acc.search(/STEP\s*1\s*:/i)
  const steps = first >= 0 ? acc.slice(first).split(/STEP\s*\d+\s*:\s*/i).map((s) => s.trim()).filter(Boolean) : []
  return { type, complete, where, steps }
}

const WRITE_RE = /\[\[write\|box:\d+,\d+,\d+,\d+\|[^\]|]+\]\]/g

async function testHints() {
  console.log('\nTutor (local Bonsai model)')
  const work = ['Q_d = 100 - 2P', 'Q_s = 20 + 2P']
  const { strokes } = linesToStrokes(work, { x: 120, y: 110, height: 46, seed: 5 })
  const board = await boardPng(strokes)
  const problemImage = await problemPng()
  const recognizedLines = [
    { n: 1, latex: 'Qd = 100 - 2P' },
    { n: 2, latex: 'Qs = 20 + 2P' },
  ]
  const base = { regionImage: board, boardImage: board, problemImages: [problemImage], recognizedLines, history: [], apiKey: '' }
  const rows = []
  const want = (name) => only.length === 0 || only.includes(name)
  let lastHint = ''
  const ask = 'Read my work first: what strategy have I started and what step am I on? Then give ONE hint for my very next move.'

  async function structured(name, body, { maxSteps, type }) {
    if (!want(name)) return null
    const r = await hint(body)
    const p = parseHint(r.text)
    console.log(`\n  [${name}]  first text ${secs(r.ttft)}, total ${secs(r.total)}`)
    console.log(r.text.split('\n').map((l) => `      ${l}`).join('\n'))
    ok(!r.error && r.done && r.malformed === 0, `${name}: clean SSE stream ending in [DONE]`, r.error || `done=${r.done}`)
    ok(HINT_TYPES.includes(p.type), `${name}: TYPE is valid (${p.type})`)
    if (type) ok(p.type === type || p.type === 'corrective', `${name}: TYPE is ${type}`, `got ${p.type}`)
    ok(p.complete === 'no', `${name}: COMPLETE is "no" for unfinished work`, `got ${p.complete}`)
    ok(p.where.length > 8, `${name}: WHERE is present`)
    ok(p.steps.length >= 1 && p.steps.length <= maxSteps, `${name}: ${p.steps.length} step(s), cap ${maxSteps}`)
    ok((r.text.match(WRITE_RE) || []).length === 1 && WRITE_RE.test(p.steps[0] ?? ''), `${name}: exactly one write marker, on STEP 1`)
    WRITE_RE.lastIndex = 0
    const prose = p.steps.join(' ').replace(/\[\[[^\]]*\]\]/g, '')
    ok(prose.length >= 25 && prose.length <= 760, `${name}: sane length (${prose.length} chars)`)
    ok(!/\*\*|\u2014|\\\(|\$\$/.test(r.text), `${name}: no markdown, LaTeX or em dashes`)
    ok(!/\bP\s*=\s*20\b|\bQ\s*=\s*60\b/.test(prose), `${name}: does not give away the final answer`)
    rows.push({ mode: name, ttft: r.ttft, total: r.total })
    return r
  }

  async function freeform(name, body, check) {
    if (!want(name)) return null
    const r = await hint(body)
    console.log(`\n  [${name}]  first text ${secs(r.ttft)}, total ${secs(r.total)}${r.highlights.length ? `  highlights ${JSON.stringify(r.highlights)}` : ''}`)
    console.log(r.text.split('\n').map((l) => `      ${l}`).join('\n'))
    ok(!r.error && r.done && r.malformed === 0, `${name}: clean SSE stream ending in [DONE]`, r.error || `done=${r.done}`)
    check(r)
    rows.push({ mode: name, ttft: r.ttft, total: r.total })
    return r
  }

  // The first request pays for reading the pasted problem image once.
  const first = await structured('hint-1 (first, reads problem image)', { ...base, gridImage: board, prompt: ask, hintLevel: 1, mode: 'hint' }, { maxSteps: 1, type: 'orienting' })
  if (first) lastHint = first.text
  for (const [level, type, maxSteps] of [
    [1, 'orienting', 1],
    [2, 'conceptual', 2],
    [3, 'strategic', 1],
    [4, 'procedural', 3],
  ]) {
    const r = await structured(`hint-${level}`, { ...base, gridImage: board, prompt: ask, hintLevel: level, mode: 'hint' }, { maxSteps, type })
    if (r) lastHint = r.text
  }
  const history = lastHint
    ? [
        { role: 'user', content: ask },
        { role: 'assistant', content: lastHint },
      ]
    : []

  await structured(
    'follow-up',
    { ...base, prompt: 'FOLLOW-UP NUDGE #1: I already got your previous hint (see our conversation). Give me ONE slightly more revealing nudge from my current work.', history, hintLevel: 2, mode: 'hint' },
    { maxSteps: 1 }
  )

  // No transcript yet (recognition still running): the model must read the board image itself.
  await structured('hint-2 (image only, no transcript)', { ...base, recognizedLines: [], gridImage: board, prompt: ask, hintLevel: 2, mode: 'hint' }, { maxSteps: 2, type: 'conceptual' })

  await freeform('voice', { ...base, prompt: 'Why do I set the two equations equal to each other?', hintLevel: 1, mode: 'voice' }, (r) => {
    const t = r.text.replace(/^SAY:\s*/i, '')
    ok(t.length >= 20 && t.length <= 420, `voice: short spoken answer (${t.length} chars)`)
    ok(!/\[\[|\*\*|WHERE:|STEP \d/.test(r.text), 'voice: plain speech, no markers or headers')
  })

  await freeform('clarify', { ...base, prompt: 'Clarifying question about your last hint: which line do I start from?', history, hintLevel: 2, mode: 'clarify' }, (r) => {
    ok(r.text.length >= 15 && r.text.length <= 420, `clarify: short answer (${r.text.length} chars)`)
    ok(!/\[\[|\*\*/.test(r.text), 'clarify: no inline markers in the text')
  })

  await freeform(
    'reexplain',
    {
      ...base,
      prompt: 'REEXPLAIN STEP: the student is confused by this part of your last hint: "At equilibrium the quantity buyers want equals the quantity sellers offer.". Re-explain ONLY this one idea a different way, still just ONE short step. Do NOT include a write box marker.',
      history,
      hintLevel: 2,
      mode: 'hint',
    },
    (r) => {
      ok(/^STEP 1: \S/.test(r.text), 'reexplain: comes back as a single STEP')
      ok(!/\[\[write/.test(r.text), 'reexplain: no write box')
    }
  )

  // Write-box check: the region image is a crop of just the box the student wrote in.
  const boxStrokes = textToStrokes('100 - 2P = 20 + 2P', { x: 30, y: 30, height: 44, seed: 9 })
  const box = await boardPng(boxStrokes, { width: 620, height: 130 })
  await structured(
    'write-check',
    {
      regionImage: box,
      problemImages: [problemImage],
      recognizedLines: [...recognizedLines, { n: 3, latex: '100 - 2P = 20 + 2P' }],
      prompt: 'I tapped the check mark on the box you circled ("Qd = Qs equation") \u2014 I\'m done writing in it. The focus image is EXACTLY that box.',
      history,
      hintLevel: 2,
      mode: 'hint',
      apiKey: '',
    },
    { maxSteps: 1 }
  )

  await freeform('solve', { ...base, prompt: 'Please show the full step-by-step solution and the final answer.', history, hintLevel: 2, mode: 'solve' }, (r) => {
    ok(/\b20\b/.test(r.text) && /\b60\b/.test(r.text), 'solve: reaches P = 20 and Q = 60')
    ok(r.text.length >= 120 && r.text.length <= 1800, `solve: sane length (${r.text.length} chars)`)
    ok(!/\\\(|\$\$|\\frac/.test(r.text), 'solve: no LaTeX')
  })

  await freeform('generalize', { ...base, prompt: 'I want the big picture now.', hintLevel: 2, mode: 'generalize' }, (r) => {
    ok(/##\s*Problem type/i.test(r.text) && /Generally/i.test(r.text), 'generalize: has the debrief sections')
    ok(r.text.length >= 200 && r.text.length <= 2200, `generalize: sane length (${r.text.length} chars)`)
  })

  const bad = await fetch(`${BASE}/api/econ/hint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ok(bad.status === 400, 'empty hint request is a 400', `status ${bad.status}`)

  console.log('\n  Latency summary')
  console.log('  mode'.padEnd(42) + 'first text   total')
  for (const r of rows) console.log(`  ${r.mode.padEnd(40)}${secs(r.ttft).padStart(8)}${secs(r.total).padStart(9)}`)
}

const HINT_TYPES = ['orienting', 'conceptual', 'strategic', 'procedural', 'corrective']

const health = await api('GET', '/api/health').catch(() => null)
if (!health || health.status !== 200) {
  console.error(`Econ Coach API is not reachable at ${BASE}. Start it with "npm run dev".`)
  process.exit(2)
}
console.log(`API ${BASE}  bonsai: ${health.json.bonsai?.reachable ? health.json.bonsai.model : 'NOT RUNNING'}`)
if (!health.json.bonsai?.reachable && (run('recognize') || run('hints'))) {
  console.error('The local Bonsai model is not running. Start it with "npm run bonsai".')
  process.exit(2)
}

if (run('accounts')) await testAccounts()
if (run('recognize')) await testRecognize()
if (run('hints')) await testHints()

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
