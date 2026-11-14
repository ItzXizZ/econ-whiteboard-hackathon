/**
 * Offline unit checks for the tutor's stream filter and the linear market
 * solver. No model or server needed:  node scripts/selftest.mjs
 */
import assert from 'node:assert/strict'
import { __test } from '../server/math.js'
import { solveLinearMarket, workShowsAnswer } from '../server/econSolver.js'

const { HintStream, ProseCleaner, classify } = __test

/** Feed `raw` in chunks of `size` characters, like a token stream. */
function runHint(raw, opts = {}, size = 3) {
  const s = new HintStream({
    targetType: 'conceptual',
    stepCap: 1,
    validLines: new Set([1, 2, 3]),
    ...opts,
  })
  let out = ''
  for (let i = 0; i < raw.length; i += size) out += s.push(raw.slice(i, i + size))
  return out + s.end()
}

const WRITE_RE = /\[\[write\|box:\d+,\d+,\d+,\d+\|[^\]|]+\]\]/g
let n = 0
function check(name, fn) {
  fn()
  n++
  console.log(`ok  ${name}`)
}

check('well-formed reply becomes the client format', () => {
  const out = runHint(
    'WHERE: You wrote both equations.\nTYPE: conceptual\nCOMPLETE: no\nWRITE: Qd = Qs equation\nSTEP 1: At equilibrium demand equals supply. Set line 1 equal to line 2 and write that equation.'
  )
  assert.match(out, /^WHERE:\nStrategy: You wrote both equations\.\nStep: /)
  assert.match(out, /\nTYPE: conceptual\n/)
  assert.match(out, /\nCOMPLETE: no\n/)
  assert.match(out, /STEP 1: At equilibrium/)
  assert.equal(out.match(WRITE_RE).length, 1)
  assert.match(out, /\|Qd = Qs equation\]\]$/)
  assert.match(out, /line 1 \[\[highlight\|line:1\]\]/)
  assert.match(out, /line 2 \[\[highlight\|line:2\]\]/)
})

for (const size of [1, 2, 5, 11, 400]) {
  check(`chunk size ${size} gives the same result`, () => {
    const raw =
      '**WHERE:** You set the two equal.\n**TYPE:** strategic\n**COMPLETE:** no\n**WRITE:** P on one side\n**STEP 1:** Nice start on line 3! Now collect the **P** terms \u2014 add $2P$ to both sides. [[write|box:1,2,3,4|4P = 80]]\nSTEP 2: Then divide.\nSTEP 3: extra'
    const out = runHint(raw, { stepCap: 2 }, size)
    // Chunking may only ever change insignificant whitespace.
    const squash = (t) => t.replace(/\s+/g, ' ')
    assert.equal(squash(out), squash(runHint(raw, { stepCap: 2 }, 7)))
    assert.doesNotMatch(out, /\*\*|\u2014|\$/)
    assert.match(out, /add 2P to both sides/)
    assert.match(out, /STEP 2: Then divide\./)
    assert.doesNotMatch(out, /STEP 3/)
    assert.equal(out.match(WRITE_RE).length, 1)
  })
}

check('prose with no format still yields a valid hint with a write marker', () => {
  const out = runHint('Set the two equations equal to each other and write that down.')
  assert.match(out, /^WHERE:\n/)
  assert.match(out, /STEP 1: Set the two equations equal/)
  assert.equal(out.match(WRITE_RE).length, 1)
})

check('empty model output never produces an empty hint', () => {
  const out = runHint('')
  assert.match(out, /STEP 1: \S/)
  assert.equal(out.match(WRITE_RE).length, 1)
})

check('headers only (token limit) still produces a step', () => {
  const out = runHint('WHERE: Something.\nTYPE: orienting\nCOMPLETE: no\nWRITE: next')
  assert.match(out, /STEP 1: \S/)
  assert.equal(out.match(WRITE_RE).length, 1)
})

check('COMPLETE yes has no write marker; solver can veto it', () => {
  const raw = 'WHERE: Done.\nTYPE: procedural\nCOMPLETE: yes\nWRITE: nothing\nSTEP 1: Great work, you found P = 20 and Q = 60.'
  assert.equal(runHint(raw).match(WRITE_RE), null)
  assert.match(runHint(raw), /COMPLETE: yes/)
  const vetoed = runHint(raw, { forceComplete: false })
  assert.match(vetoed, /COMPLETE: no/)
  assert.equal(vetoed.match(WRITE_RE).length, 1)
})

check('type is forced to the rung, except corrective', () => {
  assert.match(runHint('WHERE: x.\nTYPE: procedural\nCOMPLETE: no\nSTEP 1: Do it.'), /TYPE: conceptual/)
  assert.match(runHint('WHERE: x.\nTYPE: corrective\nCOMPLETE: no\nSTEP 1: Line 2 has a sign slip.'), /TYPE: corrective/)
})

check('invalid line numbers are not highlighted; currency survives', () => {
  const out = runHint('WHERE: x.\nTYPE: a\nCOMPLETE: no\nSTEP 1: Look at line 9. The tax is $4 per unit and buyers pay $22.')
  assert.doesNotMatch(out, /highlight/)
  assert.match(out, /\$4 per unit and buyers pay \$22\./)
})

check('a truncated marker is dropped', () => {
  const out = runHint('WHERE: x.\nTYPE: a\nCOMPLETE: no\nSTEP 1: Write the equation. [[write|box:10,2')
  assert.equal(out.match(WRITE_RE).length, 1)
  assert.doesNotMatch(out, /box:10,2(?!\d)/)
})

check('long steps are capped', () => {
  const out = runHint(`WHERE: x.\nTYPE: a\nCOMPLETE: no\nSTEP 1: ${'This sentence keeps going for a while. '.repeat(40)}`)
  const step = out.slice(out.indexOf('STEP 1:'))
  assert.ok(step.length < 460, `step length ${step.length}`)
  assert.equal(out.match(WRITE_RE).length, 1)
})

check('voice cleaner reports highlights as events', () => {
  const seen = []
  const c = new ProseCleaner({ highlights: 'event', validLines: new Set([2]), onHighlight: (h) => seen.push(h) })
  let out = ''
  for (const ch of 'Check **line 2** again [[highlight|line:2|sign]] \\(P = 20\\).') out += c.push(ch)
  out += c.flush()
  assert.deepEqual(seen, [{ lines: [2] }])
  assert.equal(out, 'Check line 2 again P = 20.')
})

check('request classification', () => {
  assert.equal(classify({ mode: 'voice', prompt: 'is line 2 right?' }).kind, 'voice')
  assert.equal(classify({ mode: 'hint', prompt: 'FOLLOW-UP NUDGE #2: more' }).nudge, 2)
  assert.equal(classify({ mode: 'hint', prompt: 'REEXPLAIN STEP: the student is confused by this part of your last hint: "Set them equal". Re-explain it.' }).confusing, 'Set them equal')
  assert.equal(classify({ mode: 'hint', prompt: 'Please show the full step-by-step solution and the final answer.' }).kind, 'solve')
  assert.equal(classify({ mode: 'hint', prompt: 'Read my work first.' }).studentText, '')
})

check('linear market solver', () => {
  const s = solveLinearMarket('Demand: Qd = 100 - 2P. Supply: Qs = 20 + 2P. A tax of $4 per unit.')
  assert.equal(s.P, 20)
  assert.equal(s.Q, 60)
  assert.equal(s.tax.Pb, 22)
  assert.equal(s.tax.dwl, 8)
  const inv = solveLinearMarket('P = 50 - 0.5Q and P = 0.5Q - 10')
  assert.equal(inv.P, 20)
  assert.equal(inv.Q, 60)
  assert.equal(solveLinearMarket('What is opportunity cost?'), null)
  const plain = solveLinearMarket('Qd = 100 - 2P, Qs = 20 + 2P')
  assert.equal(workShowsAnswer(plain, 'line 1: P = 20\nline 2: Q = 60'), true)
  assert.equal(workShowsAnswer(plain, 'line 1: P = 200\nline 2: Q = 60'), false)
})

console.log(`\n${n} checks passed`)
