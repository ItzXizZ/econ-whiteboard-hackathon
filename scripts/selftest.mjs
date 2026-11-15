/**
 * Offline unit checks for the tutor's stream filter and the linear market
 * solver. No model or server needed:  node scripts/selftest.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { __test } from '../server/math.js'
import { solveLinearMarket, solutionLatex, workShowsAnswer } from '../server/econSolver.js'
import {
  chooseEconReading,
  clusterLines,
  groupGraphs,
  mergeGraphResults,
  normalizeEconLine,
  rasterizeGraph,
  scoreEconReading,
  __test as recognizeTest,
} from '../server/recognize.js'
import { checkMarketGraph, labelMeaning, readGraphGeometry } from '../server/graphRules.js'
import { describeGraph, graphTranscriptLine } from '../server/graphCheck.js'
import { linesToStrokes, toRecognizePayload } from './strokeFont.mjs'
import { supplyDemandStrokes } from './graphFixture.mjs'

const { HintStream, ProseCleaner, classify, wantsSolutionReveal } = __test
const drawTogetherSource = await readFile(new URL('../src/lib/drawTogether.ts', import.meta.url), 'utf8')
const drawTogetherJs = ts.transpileModule(drawTogetherSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const {
  curveEquilibrium,
  beautifyStroke,
  fitGhostGuideToStroke,
  equilibriumLabelPositions,
  ghostGuideFor,
  hasStrokeSlope,
  isBowedOut,
  isCurveShifted,
  isPointRelativeToCurve,
  isPpfCurve,
  isPpfGrowth,
  isValidCurveStroke,
  labelOverlapsStroke,
  matchTogetherLesson,
  mirrorStrokeHorizontally,
  togetherLessonRationale,
  placeLabelAwayFromStrokes,
  pointLabelPosition,
  polylineIntersection,
  pickTogetherLesson,
  ppfBulgePoint,
  replaceCorrectionOpIds,
  shiftedEquilibriumLabel,
  splitWorksheetQuestions,
  SUPPLY_DEMAND_LESSON,
  TOGETHER_LESSONS,
} = await import(`data:text/javascript;base64,${Buffer.from(drawTogetherJs).toString('base64')}`)
const mathBoardManifestSource = await readFile(new URL('../src/lib/mathBoardManifest.ts', import.meta.url), 'utf8')
const mathBoardManifestJs = ts.transpileModule(mathBoardManifestSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const { computeHintPlacement } = await import(
  `data:text/javascript;base64,${Buffer.from(mathBoardManifestJs).toString('base64')}`
)
const tutorPenSource = await readFile(new URL('../src/lib/tutorPen.ts', import.meta.url), 'utf8')
const tutorPenJs = ts.transpileModule(tutorPenSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const { correctionOps, graphWrongCurveStrokes, isWholeCurveMistake } = await import(
  `data:text/javascript;base64,${Buffer.from(tutorPenJs).toString('base64')}`
)

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
  assert.equal(wantsSolutionReveal('Can you show me the answer?'), true)
  assert.equal(wantsSolutionReveal('Why did the curve shift?'), false)
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

check('solver generates hidden and revealed equations', () => {
  const solution = solveLinearMarket('Qd = 100 - 2P and Qs = 20 + 2P')
  const hidden = solutionLatex(solution)
  assert.equal(hidden.length, 3)
  assert.ok(!hidden.some((equation) => equation.startsWith('P^*')))
  const revealed = solutionLatex(solution, { reveal: true })
  assert.ok(revealed.includes('4P = 80'))
  assert.ok(revealed.includes('P^* = 20'))
  assert.ok(revealed.includes('Q^* = 100 - 2(20) = 60'))

  const negativeIntercept = solveLinearMarket('Qd = 100 - 2P and Qs = -10 + 3P')
  assert.ok(solutionLatex(negativeIntercept).includes('Q_s = -10 + 3P'))
  assert.deepEqual(solutionLatex(null), [])

  const taxed = solveLinearMarket('Qd = 100 - 2P and Qs = 20 + 2P. A tax of $4 per unit.')
  assert.ok(solutionLatex(taxed, { reveal: true }).includes('P_b = 22,\\; P_s = 18,\\; Q_t = 56'))
})

check('economics handwriting normalization and scoring', () => {
  assert.equal(normalizeEconLine('60-2p=2p-2d'), '60-2P=2P-20')
  assert.equal(normalizeEconLine('ID0 = 4P'), '100 = 4P')
  assert.equal(normalizeEconLine('IDU = 4P'), '100 = 4P')
  assert.equal(normalizeEconLine('Q5=2-30'), 'Qs=2-30')
  assert.equal(normalizeEconLine('Q_5 = 2P - 30'), 'Qs = 2P - 30')
  assert.equal(normalizeEconLine('Qd=120-3P'), 'Qd=120-3P')
  assert.equal(normalizeEconLine('D'), 'D')
  assert.equal(normalizeEconLine('MR = MC'), 'MR = MC')
  assert.ok(scoreEconReading('80-2P=2P-20') > scoreEconReading('80-2P=2P-2⊙'))
  assert.equal(chooseEconReading('80-2P=2P-2⊙', '80-2P=2P-20'), '80-2P=2P-20')
  assert.equal(recognizeTest.isNonTextReading('\\int x^2 dx', '∫x²dx'), true)
  assert.equal(recognizeTest.isNonTextReading('y=mx+b', 'y=mx+b'), true)
  assert.equal(recognizeTest.isNonTextReading('', 'MR = MC'), false)
})

check('prices are not math, bare LaTeX becomes plain text', () => {
  const run = (raw, size = 4) => {
    const c = new ProseCleaner({})
    let out = ''
    for (let i = 0; i < raw.length; i += size) out += c.push(raw.slice(i, i + size))
    return (out + c.flush()).replace(/\s+/g, ' ').trim()
  }
  for (const size of [1, 3, 7, 200]) {
    assert.equal(
      run('Draw the line at $6 on the vertical axis and see where the $6 horizontal line meets demand.', size),
      'Draw the line at $6 on the vertical axis and see where the $6 horizontal line meets demand.'
    )
    assert.equal(run('The tax is \\$2, so price rises from \\$10.', size), 'The tax is $2, so price rises from $10.')
    assert.equal(run('Elasticity is \\frac{10}{5} here, so 3 \\times 4 is next.', size), 'Elasticity is (10)/(5) here, so 3 x 4 is next.')
    assert.equal(run('Set $Q_d = Q_s$ first.', size), 'Set Qd = Qs first.')
  }
})

await (async () => {
  const text = toRecognizePayload(linesToStrokes(['Qd = 100 - 2P', 'Qs = 20 + 2P'], { x: 60, y: 120 }).strokes).strokes
  const graph = supplyDemandStrokes()
  const c = clusterLines(recognizeTest.cleanStrokes([...text, ...graph]))
  const g = groupGraphs(c.lines, c.drawings)
  const png = g.graphs[0] ? (await rasterizeGraph(g.graphs[0].strokes)).png : null
  check('a drawn graph is separated from the handwriting, labels included', () => {
    assert.equal(g.graphs.length, 1)
    assert.equal(g.lines.length, 2)
    assert.equal(g.graphs[0].strokes.length, graph.length)
    assert.ok(png && png.length > 1000)
    // Text alone, or a single long underline, is never a graph.
    const only = clusterLines(recognizeTest.cleanStrokes(text))
    assert.equal(groupGraphs(only.lines, only.drawings).graphs.length, 0)
  })
})()

check('graph checker output is only reported when it is confident', () => {
  const ok = describeGraph({ graph_type: 'supply_demand_equilibrium', graph_type_conf: 0.97, verdict: 'correct', p_incorrect: 0.01 })
  assert.equal(ok.status, 'recognized')
  assert.equal(graphTranscriptLine(ok), 'Graph of supply and demand. The graph checker flagged no mistakes.')
  const vague = describeGraph({ graph_type: 'isoquant_isocost', graph_type_conf: 0.6, verdict: 'correct', p_incorrect: 0 })
  assert.equal(vague.status, 'unknown')
  assert.doesNotMatch(graphTranscriptLine(vague), /isoquant/)
  const bad = describeGraph({
    graph_type: 'monopoly', graph_type_conf: 1, verdict: 'incorrect', p_incorrect: 0.98, error_type: 'price_read_from_mr',
    error_bbox: [10, 20, 30, 40], explanation: 'x', fix: 'Read the price off the demand curve.',
  })
  assert.equal(bad.status, 'mistake')
  assert.match(graphTranscriptLine(bad), /^Graph of monopoly\. The graph checker flagged a likely mistake: price read from mr\. Fix: Read/)
  const weak = describeGraph({ graph_type: 'monopoly', graph_type_conf: 1, verdict: 'incorrect', p_incorrect: 0.6, error_type: 'price_read_from_mr' })
  assert.equal(weak.status, 'recognized')
})

check('measured graph checks catch the classic supply and demand mistakes', () => {
  /** Cluster a fixture graph and "read" its labels from the fixture's stroke ids. */
  const analyze = (kind, seed = 3, size = 320) => {
    const c = clusterLines(recognizeTest.cleanStrokes(supplyDemandStrokes({ kind, seed, size })))
    const g = groupGraphs(c.lines, c.drawings).graphs[0]
    assert.ok(g, `${kind}: graph found`)
    const labels = g.labels.map((ls) => {
      const letter = ls[0].id.match(/^g_l([sdpq])/)?.[1]?.toUpperCase() ?? '?'
      const xs = ls.flatMap((s) => [s.minX, s.maxX])
      const ys = ls.flatMap((s) => [s.minY, s.maxY])
      return { text: letter, bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } }
    })
    return { graph: g, rules: checkMarketGraph(g.bigStrokes, labels) }
  }
  const run = (...args) => analyze(...args).rules
  for (const seed of [3, 11, 29]) {
    for (const size of [220, 320, 460]) {
      assert.deepEqual(run('correct', seed, size).mistakes, [], `correct graph, seed ${seed}, size ${size}`)
      assert.match(run('demand_up', seed, size).mistakes[0].mistake, /demand curve slopes upward/)
      assert.match(run('labels_swapped', seed, size).mistakes[0].mistake, /wrong curves/)
      assert.match(run('axes_swapped', seed, size).mistakes[0].mistake, /wrong axes/)
    }
  }
  const demandUp = analyze('demand_up')
  const demandMistake = demandUp.rules.mistakes[0]
  assert.deepEqual(demandMistake.correction.lines[0].pts, [
    [demandMistake.box[0], demandMistake.box[1]],
    [demandMistake.box[2], demandMistake.box[3]],
  ])
  const swapped = analyze('labels_swapped')
  const swappedCorrection = swapped.rules.mistakes.find((m) => /wrong curves/.test(m.mistake)).correction
  const swappedCurves = readGraphGeometry(swapped.graph.bigStrokes).curves
  const curveUp = swappedCurves.find((c) => c.direction === 'up')
  const curveDown = swappedCurves.find((c) => c.direction === 'down')
  assert.deepEqual(swappedCorrection.labels, [
    { text: 'S', x: Math.round(curveUp.ends[1][0] + 14), y: Math.round(curveUp.ends[1][1]) },
    { text: 'D', x: Math.round(curveDown.ends[1][0] + 14), y: Math.round(curveDown.ends[1][1]) },
  ])
  const axesSwapped = analyze('axes_swapped')
  const axesFrame = readGraphGeometry(axesSwapped.graph.bigStrokes).frame
  assert.deepEqual(axesSwapped.rules.mistakes[0].correction.labels, [
    { text: 'P', x: Math.round(axesFrame.minX - 18), y: Math.round(axesFrame.minY + 10) },
    { text: 'Q', x: Math.round(axesFrame.maxX + 12), y: Math.round(axesFrame.maxY + 20) },
  ])
  // No readable S or D label: nothing is claimed.
  const c = clusterLines(recognizeTest.cleanStrokes(supplyDemandStrokes()))
  assert.equal(checkMarketGraph(groupGraphs(c.lines, c.drawings).graphs[0].bigStrokes, []), null)
  assert.equal(labelMeaning(' d1 '), 'D')
  assert.equal(labelMeaning('Supply'), 'S')
  assert.equal(labelMeaning('MC'), null)
  // A measured mistake outranks the model; a measured pass names the graph even if the model could not.
  const bad = mergeGraphResults({ status: 'recognized', name: 'supply and demand' }, demandUp.rules)
  assert.equal(bad.status, 'mistake')
  assert.deepEqual(bad.correction.lines, demandMistake.correction.lines)
  assert.match(graphTranscriptLine(bad), /^Graph of supply and demand\. It has a mistake: the demand curve slopes upward\. Fix: /)
  const combined = mergeGraphResults(
    { status: 'unknown', name: '' },
    {
      name: 'supply and demand',
      mistakes: [
        { mistake: 'first', explanation: 'first', fix: 'first', box: [0, 0, 1, 1], correction: { lines: [{ label: 'D', pts: [[0, 0], [1, 1]] }] } },
        { mistake: 'second', explanation: 'second', fix: 'second', box: [1, 1, 2, 2], correction: { labels: [{ text: 'S', x: 3, y: 4 }] } },
      ],
    }
  )
  assert.deepEqual(combined.correction, {
    lines: [{ label: 'D', pts: [[0, 0], [1, 1]] }],
    labels: [{ text: 'S', x: 3, y: 4 }],
  })
  const fine = mergeGraphResults({ status: 'unknown', name: '' }, run('correct'))
  assert.equal(fine.status, 'recognized')
  assert.equal(fine.checked, true)
  assert.match(graphTranscriptLine(fine), /Measured: demand slopes down/)
})

check('draw-together direction checks use the screen-space right endpoint', () => {
  const down = { points: [{ x: 0, y: 0 }, { x: 100, y: 60 }] }
  const reversedDown = { points: [{ x: 100, y: 60 }, { x: 0, y: 0 }] }
  const up = { points: [{ x: 0, y: 60 }, { x: 100, y: 0 }] }
  assert.equal(hasStrokeSlope(down, 'down'), true)
  assert.equal(hasStrokeSlope(reversedDown, 'down'), true)
  assert.equal(hasStrokeSlope(up, 'down'), false)
})

check('draw-together finds polyline intersections', () => {
  assert.deepEqual(
    polylineIntersection(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 0 }]
    ),
    { x: 5, y: 5 }
  )
})

check('draw-together lesson configs and problem picker cover all five graph types', () => {
  assert.deepEqual(
    TOGETHER_LESSONS.map((lesson) => lesson.shortTitle),
    ['Supply & demand', 'Currency', 'Loanable funds', 'Bonds', 'PPF']
  )
  assert.equal(TOGETHER_LESSONS.length, 5)
  assert.deepEqual(
    TOGETHER_LESSONS.filter((lesson) => lesson.kind === 'market').map((lesson) => lesson.id),
    ['supply-demand', 'fx', 'loanable-funds', 'bonds']
  )
  for (const lesson of TOGETHER_LESSONS.filter((entry) => entry.kind === 'market')) {
    assert.ok(lesson.first.label && lesson.second.label)
    assert.ok(['up', 'down'].includes(lesson.first.slope))
    assert.ok(['up', 'down'].includes(lesson.second.slope))
    assert.ok(lesson.eqLabels.y && lesson.eqLabels.x)
    assert.equal(lesson.steps.length, 7)
  }
  assert.deepEqual(SUPPLY_DEMAND_LESSON.steps.map((step) => step.say), [
    "I'll draw the axes. Your turn: draw the demand curve.",
    'Draw demand from the upper left to the lower right.',
    'Now draw supply.',
    'Draw supply from the lower left to the upper right.',
    'They cross at the equilibrium. Now show what happens if demand increases: draw the new demand curve.',
    'Draw a new demand curve shifted to the right or above the first one.',
    'Price and quantity both rise. Nice work!',
  ])
  const fxLesson = TOGETHER_LESSONS.find((lesson) => lesson.id === 'fx')
  assert.deepEqual(
    [fxLesson.yLabel, fxLesson.xLabel, fxLesson.eqLabels, fxLesson.shift.newLabel],
    ['€ per $', 'Q of $', { y: 'e*', x: 'Q*' }, 'D₂']
  )
  const loanableLesson = TOGETHER_LESSONS.find((lesson) => lesson.id === 'loanable-funds')
  assert.deepEqual(
    [loanableLesson.yLabel, loanableLesson.xLabel, loanableLesson.eqLabels, loanableLesson.shift.dir],
    ['r', 'Q of loanable funds', { y: 'r*', x: 'Q*' }, 'left']
  )
  const bondLesson = TOGETHER_LESSONS.find((lesson) => lesson.id === 'bonds')
  assert.deepEqual(
    [bondLesson.yLabel, bondLesson.xLabel, bondLesson.eqLabels, bondLesson.shift.doneMsg],
    ['Price of bonds', 'Q of bonds', { y: 'Pb*', x: 'Qb*' }, 'Bond prices rise, so interest rates fall.']
  )
  assert.equal(TOGETHER_LESSONS.find((lesson) => lesson.id === 'ppf').steps.length, 8)
  assert.equal(pickTogetherLesson('Draw a PPF for production possibilities').id, 'ppf')
  assert.equal(pickTogetherLesson('Explain how the exchange rate affects the euro').id, 'fx')
  assert.equal(pickTogetherLesson('A budget deficit reduces national saving').id, 'loanable-funds')
  assert.equal(pickTogetherLesson('The Fed buys bonds').id, 'bonds')
  assert.equal(pickTogetherLesson('Find the market equilibrium').id, 'supply-demand')
  assert.equal(pickTogetherLesson('exchange rate and bonds').id, 'fx')
  assert.equal(matchTogetherLesson('The Fed buys bonds').id, 'bonds')
  assert.equal(matchTogetherLesson('The dollar depreciates against the yen').id, 'fx')
  assert.equal(matchTogetherLesson('Define opportunity cost').id, 'ppf')
  assert.equal(matchTogetherLesson('What is GDP?'), null)
  assert.match(togetherLessonRationale('budget deficit'), /budget deficit.*loanable funds/i)
  assert.equal(matchTogetherLesson('Budget deficit and loanable funds').id, 'loanable-funds')
  assert.deepEqual(
    splitWorksheetQuestions('1. Budget deficit affects loanable funds. 2) The Fed buys bonds.'),
    ['Budget deficit affects loanable funds.', 'The Fed buys bonds.']
  )
  assert.deepEqual(splitWorksheetQuestions('(a) First part\nb. Second part'), ['First part', 'Second part'])
  assert.deepEqual(splitWorksheetQuestions('Define opportunity cost.'), ['Define opportunity cost.'])
  const worksheetItems = splitWorksheetQuestions(
    '1. The government runs a budget deficit. Show the effect on the loanable funds market.\n' +
      '2. The Fed buys bonds.\n' +
      '3. Define opportunity cost.'
  )
  assert.equal(worksheetItems.length, 3)
  assert.deepEqual(
    worksheetItems.map((item) => matchTogetherLesson(item)?.id ?? null),
    ['loanable-funds', 'bonds', 'ppf']
  )
})

check('draw-together recap copy exactly matches the supplied lesson wording', () => {
  const expected = {
    'Supply and demand': {
      headline: 'You built a supply and demand market',
      takeaways: [
        'Demand slopes down: at higher prices, people buy less.',
        'Supply slopes up: higher prices make producers offer more.',
        'When demand increases, D shifts right, so equilibrium price and quantity both rise.',
      ],
      practice: 'A drought cuts the wheat harvest. What happens to the equilibrium price and quantity of wheat?',
      answer: 'Supply shifts left, so the price rises and the quantity falls.',
    },
    'Market for dollars': {
      headline: 'You built the market for dollars',
      takeaways: [
        'Demand for dollars slopes down: a cheaper dollar makes US goods and assets cheaper for foreigners.',
        'Supply of dollars slopes up: a stronger dollar makes foreign goods cheaper, so Americans sell more dollars.',
        'Higher US interest rates raise demand for dollars, so the dollar appreciates.',
      ],
      practice: 'Americans start buying many more European cars. What happens to the value of the dollar in euros?',
      answer: 'Americans sell dollars to buy euros, so the supply of dollars shifts right and the dollar depreciates.',
    },
    'Loanable funds': {
      headline: 'You built the loanable funds market',
      takeaways: [
        'Saving supplies loanable funds; investment demands them.',
        'The real interest rate balances saving and investment.',
        'A budget deficit lowers national saving, so the interest rate rises and private investment falls: crowding out.',
      ],
      practice: 'The government adds a new tax credit for business investment. What happens to the interest rate and the quantity of loanable funds?',
      answer: 'Investment demand shifts right, so the interest rate rises and the quantity of loanable funds rises.',
    },
    'Bond market': {
      headline: 'You built the bond market',
      takeaways: [
        'Bond prices and interest rates move in opposite directions.',
        'When the Fed buys bonds, demand for bonds shifts right.',
        'Bond prices rise, so interest rates fall: expansionary monetary policy.',
      ],
      practice: 'The Fed sells bonds in an open-market sale. What happens to bond prices and interest rates?',
      answer: 'More bonds come onto the market, so bond prices fall and interest rates rise.',
    },
    'Production possibilities frontier': {
      headline: 'You built a production possibilities frontier',
      takeaways: [
        'Points on the PPF are efficient; points inside it leave resources unused.',
        "Points outside the PPF can't be reached with today's resources and technology.",
        'Economic growth shifts the PPF outward, so once-unattainable points become possible.',
      ],
      practice: 'A country on its PPF decides to produce more capital goods. What does it give up, and why does each extra unit cost more?',
      answer: "It gives up consumer goods. Resources aren't equally suited to both, so the opportunity cost rises as it specializes: that's why the PPF bows out.",
    },
  }
  for (const lesson of TOGETHER_LESSONS) {
    assert.deepEqual(lesson.recap, expected[lesson.title], lesson.title)
    assert.equal(lesson.recap.takeaways.length, 3)
  }
})

check('draw-together shift tests require a six-percent horizontal move', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  const original = { points: [{ x: 100, y: 20 }, { x: 160, y: 80 }] }
  const right = { points: [{ x: 140, y: 20 }, { x: 200, y: 80 }] }
  const left = { points: [{ x: 60, y: 20 }, { x: 120, y: 80 }] }
  const tooSmall = { points: [{ x: 110, y: 20 }, { x: 170, y: 80 }] }
  assert.equal(isCurveShifted(original, right, 'right', box), true)
  assert.equal(isCurveShifted(original, left, 'left', box), true)
  assert.equal(isCurveShifted(original, tooSmall, 'right', box), false)
  assert.equal(isCurveShifted(original, right, 'left', box), false)
})

check('draw-together beautifies near-lines and preserves curve endpoints and PPF bow', () => {
  const jitteryLine = Array.from({ length: 20 }, (_, index) => ({
    x: index * 5,
    y: index * 3 + Math.sin(index * 4.7) * 1.2,
  }))
  const straightened = beautifyStroke(jitteryLine, 'line')
  assert.equal(straightened.length, 48)
  const start = straightened[0]
  const end = straightened[straightened.length - 1]
  const residuals = straightened.map((point) =>
    Math.abs(
      (end.x - start.x) * (start.y - point.y) -
        (start.x - point.x) * (end.y - start.y)
    ) / Math.hypot(end.x - start.x, end.y - start.y)
  )
  assert.ok(Math.max(...residuals) < 1e-8)
  assert.ok(Math.hypot(start.x - jitteryLine[0].x, start.y - jitteryLine[0].y) < 1)
  assert.ok(Math.hypot(end.x - jitteryLine.at(-1).x, end.y - jitteryLine.at(-1).y) < 1)

  const box = { x: 0, y: 0, w: 360, h: 280 }
  const ppf = [{ x: 42, y: 22 }, { x: 130, y: 42 }, { x: 230, y: 106 }, { x: 346, y: 254 }]
  const smoothedPpf = { points: beautifyStroke(ppf, 'curve') }
  assert.equal(smoothedPpf.points.length, 48)
  assert.deepEqual(smoothedPpf.points[0], ppf[0])
  assert.deepEqual(smoothedPpf.points.at(-1), ppf.at(-1))
  assert.equal(isBowedOut(smoothedPpf, box), true)
})

check('draw-together correction morphs fit the rejected stroke and reverse its slope', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  const wrongDemand = {
    points: [{ x: 16, y: 220 }, { x: 170, y: 130 }, { x: 344, y: 40 }],
  }
  const mirrored = { points: mirrorStrokeHorizontally(wrongDemand) }
  assert.equal(hasStrokeSlope(mirrored, 'down'), true)
  const guide = ghostGuideFor(SUPPLY_DEMAND_LESSON, 'first', { box })
  const corrected = { points: fitGhostGuideToStroke(guide, wrongDemand) }
  assert.equal(isValidCurveStroke(corrected, box, 'down'), true)
})

check('draw-together distinguishes shifted equilibrium labels', () => {
  assert.deepEqual(
    ['P*', 'Q*', 'e*', 'r*', 'Pb*', 'Qb*'].map(shiftedEquilibriumLabel),
    ['P₂', 'Q₂', 'e₂', 'r₂', 'Pb₂', 'Qb₂']
  )
})

check('draw-together computes the shifted market equilibrium from the new curve', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  const demand = { points: [{ x: 42, y: 22 }, { x: 346, y: 254 }] }
  const originalSupply = { points: [{ x: 42, y: 254 }, { x: 346, y: 22 }] }
  const shiftedSupply = { points: [{ x: 42, y: 220 }, { x: 312, y: 22 }] }
  const original = curveEquilibrium(demand.points, originalSupply.points, box)
  const shifted = curveEquilibrium(demand.points, shiftedSupply.points, box)
  assert.ok(shifted.x < original.x)
  assert.ok(shifted.y < original.y)
})

check('draw-together keeps shifted equilibrium labels aligned to their own guides', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  const original = { x: 220, y: 150 }
  const shifted = { x: 200, y: 145 }
  const originalLabels = equilibriumLabelPositions(box, original, 'r*', 'Q*')
  const shiftedLabels = equilibriumLabelPositions(box, shifted, 'r₂', 'Q₂', original)
  const quantityWidth = 'Q₂'.length * 13 * 0.65
  assert.equal(originalLabels.quantity.x + quantityWidth / 2, original.x)
  assert.equal(shiftedLabels.quantity.x + quantityWidth / 2, shifted.x)
  assert.ok(shiftedLabels.quantity.y > originalLabels.quantity.y)
  assert.equal(originalLabels.price.y - 4, original.y)
  assert.equal(shiftedLabels.price.y - 4, shifted.y)
  assert.ok(shiftedLabels.price.x < originalLabels.price.x)
})

check('draw-together classifies dash marks around a bowed-out PPF', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  const bowedOut = {
    points: [{ x: 42, y: 64 }, { x: 194, y: 95 }, { x: 346, y: 254 }],
  }
  const straight = {
    points: [{ x: 42, y: 22 }, { x: 194, y: 138 }, { x: 346, y: 254 }],
  }
  const bowedIn = {
    points: [{ x: 42, y: 22 }, { x: 194, y: 180 }, { x: 346, y: 254 }],
  }
  const nearOriginDash = { points: [{ x: 25, y: 240 }, { x: 95, y: 240 }] }
  const aboveRightDash = { points: [{ x: 285, y: 50 }, { x: 355, y: 50 }] }
  const beyondXAxisDash = { points: [{ x: 360, y: 250 }, { x: 430, y: 250 }] }
  const onCurveDash = { points: [{ x: 159, y: 95 }, { x: 229, y: 95 }] }
  const leftOfAxisDash = { points: [{ x: -10, y: 60 }, { x: 60, y: 60 }] }
  const belowXAxisDash = { points: [{ x: 200, y: 270 }, { x: 270, y: 270 }] }
  const phoneDash = { points: [{ x: 360, y: 220 }, { x: 500, y: 220 }] }
  const tooLong = { points: [{ x: 100, y: 100 }, { x: 210, y: 100 }] }
  const grown = {
    points: [{ x: 42, y: 22 }, { x: 194, y: 55 }, { x: 346, y: 254 }],
  }
  assert.equal(isBowedOut(bowedOut, box), true)
  assert.equal(isBowedOut(straight, box), false)
  assert.equal(isBowedOut(bowedIn, box), false)
  assert.equal(isPpfCurve(bowedOut, box), true)
  assert.equal(isPpfGrowth(bowedOut, grown, box), true)
  assert.ok(ppfBulgePoint(bowedOut))
  assert.equal(isPointRelativeToCurve(nearOriginDash, bowedOut, box, 'inside'), true)
  assert.equal(isPointRelativeToCurve(nearOriginDash, bowedOut, box, 'outside'), false)
  assert.equal(isPointRelativeToCurve(aboveRightDash, bowedOut, box, 'outside'), true)
  assert.equal(isPointRelativeToCurve(beyondXAxisDash, bowedOut, box, 'outside'), true)
  assert.equal(isPointRelativeToCurve(onCurveDash, bowedOut, box, 'inside'), false)
  assert.equal(isPointRelativeToCurve(onCurveDash, bowedOut, box, 'outside'), false)
  assert.equal(isPointRelativeToCurve(leftOfAxisDash, bowedOut, box, 'outside'), false)
  assert.equal(isPointRelativeToCurve(belowXAxisDash, bowedOut, box, 'outside'), false)
  assert.equal(isPointRelativeToCurve(phoneDash, bowedOut, box, 'outside'), false)
  assert.equal(isPointRelativeToCurve(phoneDash, bowedOut, box, 'outside', 0.5), true)
  assert.equal(isPointRelativeToCurve(tooLong, bowedOut, box, 'inside'), false)
})

check('draw-together ghost guides satisfy each market and PPF step validator', () => {
  const box = { x: 0, y: 0, w: 360, h: 280 }
  for (const lesson of TOGETHER_LESSONS.filter((item) => item.kind === 'market')) {
    const first = { points: ghostGuideFor(lesson, 'first', { box }).points }
    const second = { points: ghostGuideFor(lesson, 'second', { box }).points }
    assert.equal(first.points.length, 48, `${lesson.id} first guide is smooth`)
    assert.equal(second.points.length, 48, `${lesson.id} second guide is smooth`)
    assert.equal(isValidCurveStroke(first, box, lesson.first.slope), true, lesson.id)
    assert.equal(isValidCurveStroke(second, box, lesson.second.slope), true, lesson.id)
    const base = lesson.shift.curve === 'first' ? first : second
    const shifted = {
      points: ghostGuideFor(lesson, 'shift', { box, first, second }).points,
    }
    assert.equal(shifted.points.length, 48, `${lesson.id} shift guide is smooth`)
    const curve = lesson.shift.curve === 'first' ? lesson.first : lesson.second
    assert.equal(isValidCurveStroke(shifted, box, curve.slope), true, lesson.id)
    assert.equal(isCurveShifted(base, shifted, lesson.shift.dir, box), true, lesson.id)
  }

  const ppf = TOGETHER_LESSONS.find((item) => item.kind === 'ppf')
  const frontier = { points: ghostGuideFor(ppf, 'ppf-frontier', { box }).points }
  const growth = { points: ghostGuideFor(ppf, 'ppf-growth', { box, frontier }).points }
  assert.equal(frontier.points.length, 48)
  assert.equal(growth.points.length, 48)
  assert.equal(isPpfCurve(frontier, box), true)
  assert.equal(isPpfCurve(growth, box), true)
  assert.equal(isPpfGrowth(frontier, growth, box), true)
  for (const [need, side] of [
    ['inside-point', 'inside'],
    ['outside-point', 'outside'],
  ]) {
    const mark = { points: ghostGuideFor(ppf, need, { box, frontier }).points }
    assert.equal(isPointRelativeToCurve(mark, frontier, box, side), true, need)
  }
})

check('draw-together replaces previous wrong-attempt correction circles', () => {
  let active = replaceCorrectionOpIds([], ['circle-1']).active
  const secondAttempt = replaceCorrectionOpIds(active, ['circle-2'])
  assert.deepEqual(secondAttempt.remove, ['circle-1'])
  assert.deepEqual(secondAttempt.active, ['circle-2'])
})

check('draw-together places labels clear of intersecting strokes', () => {
  const stroke = { points: [{ x: 20, y: 10 }, { x: 130, y: 10 }] }
  const preferred = { x: 40, y: 10 }
  const placed = placeLabelAwayFromStrokes(preferred, 'PPF', [stroke], 16)
  assert.notDeepEqual(placed, preferred)
  assert.equal(labelOverlapsStroke(placed, 'PPF', stroke, 16), false)
})

check('draw-together caps label nudging when all nearby candidates collide', () => {
  const preferred = { x: 60, y: 60 }
  const strokes = Array.from({ length: 14 }, (_, index) => {
    const y = preferred.y - 52 + index * 8
    return { points: [{ x: -500, y }, { x: 500, y }] }
  })
  const placed = placeLabelAwayFromStrokes(preferred, 'A', strokes, 12)
  const cap = 3 * Math.max(10, 12 * 0.85)
  assert.ok(Math.hypot(placed.x - preferred.x, placed.y - preferred.y) <= cap)
})

check('draw-together flips labels into the visible viewport', () => {
  const viewport = { minX: 0, minY: 0, maxX: 300, maxY: 200 }
  const anchor = { x: 280, y: 50 }
  const text = 'B: unattainable'
  const preferred = pointLabelPosition(anchor, text, 16, viewport)
  const placed = placeLabelAwayFromStrokes(preferred, text, [], 16, viewport)
  const width = text.length * 16 * 0.65
  assert.ok(placed.x < anchor.x)
  assert.ok(placed.x >= viewport.minX)
  assert.ok(placed.x + width <= viewport.maxX)
  assert.ok(placed.y - 16 >= viewport.minY)
})

check('draw-together keeps point labels clear of their marker at phone zoom', () => {
  const viewport = { minX: 0, minY: 0, maxX: 300, maxY: 200 }
  const anchor = { x: 150, y: 50 }
  const text = 'B: unattainable for now'
  const fontSize = 16
  const zoom = 0.5
  const position = pointLabelPosition(anchor, text, fontSize, viewport, zoom)
  const width = text.length * fontSize * 0.65
  const left = position.x
  const right = position.x + width
  const top = position.y - fontSize
  const bottom = position.y + fontSize * 0.25
  const dx = anchor.x < left ? left - anchor.x : anchor.x > right ? anchor.x - right : 0
  const dy = anchor.y < top ? top - anchor.y : anchor.y > bottom ? anchor.y - bottom : 0

  assert.ok(left >= viewport.minX)
  assert.ok(right <= viewport.maxX)
  assert.ok(top >= viewport.minY)
  assert.ok(bottom <= viewport.maxY)
  assert.ok(Math.hypot(dx, dy) >= 18 / zoom)
})

check('tutor-card placement avoids the protected Ask bar before other obstacles', () => {
  const askBar = { left: 316, top: 650, right: 836, bottom: 700 }
  const position = computeHintPlacement({
    paneWidth: 1152,
    paneHeight: 720,
    cardWidth: 496,
    cardHeight: 220,
    obstacles: [askBar],
    protectedObstacles: [askBar],
    margin: 12,
    preferred: { left: 500, top: 450 },
  })
  const card = {
    left: position.left,
    top: position.top,
    right: position.left + 496,
    bottom: position.top + 220,
  }

  assert.ok(card.right <= askBar.left || card.left >= askBar.right || card.bottom <= askBar.top || card.top >= askBar.bottom)
})

check('whole-curve graph mistakes trace red and keep green corrections', () => {
  const wholeCurve = {
    status: 'mistake',
    name: 'supply and demand',
    mistake: 'the demand curve slopes upward',
    errorBox: { minX: 30, minY: 20, maxX: 130, maxY: 100 },
    correction: { lines: [{ label: 'D', pts: [{ x: 0, y: 100 }, { x: 100, y: 0 }] }] },
  }
  const axes = {
    id: 'axes',
    points: [{ x: 0, y: 0 }, { x: 0, y: 120 }, { x: 140, y: 120 }],
  }
  const supply = {
    id: 'supply',
    points: [{ x: 20, y: 110 }, { x: 120, y: 40 }],
  }
  const wrongDemand = {
    id: 'wrong-demand',
    points: [{ x: 30, y: 100 }, { x: 130, y: 20 }],
  }
  assert.deepEqual(
    graphWrongCurveStrokes(wholeCurve, ['axes', 'supply', 'wrong-demand'], [axes, supply, wrongDemand]).map(
      (stroke) => stroke.id
    ),
    ['wrong-demand']
  )
  const ops = correctionOps(wholeCurve, [
    { points: [{ x: 0, y: 100 }, { x: 50, y: 40 }, { x: 100, y: 0 }], width: 2 },
  ])
  const redIndex = ops.findIndex(
    (op) => op.kind === 'stroke' && op.stroke.color === 'rgba(220,38,38,0.35)'
  )
  const greenIndex = ops.findIndex(
    (op) => op.kind === 'stroke' && op.stroke.color === '#059669'
  )
  assert.equal(isWholeCurveMistake(wholeCurve), true)
  assert.ok(redIndex >= 0)
  assert.ok(ops[redIndex].stroke.width >= 12)
  assert.ok(greenIndex > redIndex)
  assert.equal(ops.some((op) => op.kind === 'stroke' && op.stroke.id === 'circle-stroke-0'), false)

  const localError = {
    ...wholeCurve,
    mistake: 'P and Q are on the wrong axes',
  }
  assert.equal(isWholeCurveMistake(localError), false)
  assert.ok(correctionOps(localError).some((op) => op.kind === 'stroke' && op.stroke.id === 'circle-stroke-0'))
})

console.log(`\n${n} checks passed`)
