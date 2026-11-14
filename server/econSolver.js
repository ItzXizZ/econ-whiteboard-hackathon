/**
 * Tiny deterministic solver for the demo problem family: linear supply and
 * demand (equilibrium, then an optional per-unit tax and surplus follow-up).
 *
 * A 4B ternary model coaches far more reliably when it is handed the correct
 * solution path as private notes instead of having to do the algebra itself
 * while also reading handwriting. This never replaces the model; it only
 * grounds it. If the text does not contain a recognisable linear demand and
 * supply pair, solveLinearMarket() returns null and the tutor works unaided.
 */

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`
/** Unicode minus, en dash, em dash: all mean "minus" in recognised handwriting. */
const DASHES = /[\u2212\u2013\u2014]/g

export function fmt(n) {
  if (!Number.isFinite(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}

/**
 * Parse "100 - 2P", "20+2P", "3P", "-10 + 0.5 P" as const + coef * VAR.
 * Returns { c, k } or null when the expression is not that simple.
 */
function parseLinear(expr, variable) {
  let s = expr.replace(DASHES, '-').replace(/\s+/g, '').replace(/\*/g, '')
  if (!s) return null
  if (!/^[+-]/.test(s)) s = `+${s}`
  const termRe = new RegExp(`([+-])(${NUM})?(${variable})?`, 'gi')
  let c = 0
  let k = 0
  let consumed = 0
  let sawTerm = false
  for (const m of s.matchAll(termRe)) {
    if (m.index !== consumed) return null
    if (!m[2] && !m[3]) return null
    consumed += m[0].length
    const sign = m[1] === '-' ? -1 : 1
    const mag = m[2] ? Number(m[2]) : 1
    if (m[3]) k += sign * mag
    else c += sign * mag
    sawTerm = true
  }
  if (!sawTerm || consumed !== s.length) return null
  return { c, k }
}

function curveRegex(lhs, rhsVar) {
  const term = `(?:${NUM}\\s*\\*?\\s*${rhsVar}?|${rhsVar})`
  return new RegExp(
    `\\b${lhs}\\s*([dDsS])?\\s*=\\s*([-+]?\\s*${term}(?:\\s*[-+]\\s*${term})*)(?!\\w|\\.\\d)`,
    'g'
  )
}

/** Find linear demand/supply curves anywhere in the given text. */
export function findCurves(text) {
  const src = String(text || '').replace(DASHES, '-').replace(/[_{}\\]/g, '')
  let demand = null
  let supply = null

  // Q = a + bP forms. The LHS says which curve when labelled (Qd / Qs / QD / QS).
  for (const m of src.matchAll(curveRegex('Q', 'P'))) {
    const lin = parseLinear(m[2], 'P')
    if (!lin || lin.k === 0) continue
    const label = (m[1] || '').toLowerCase()
    const curve = { a: lin.c, b: lin.k, text: `Q${label} = ${m[2].replace(/\s+/g, ' ').trim()}` }
    const isDemand = label ? label === 'd' : lin.k < 0
    if (isDemand && lin.k < 0 && !demand) demand = curve
    else if (!isDemand && lin.k > 0 && !supply) supply = curve
  }

  // Inverse forms P = a + bQ (only when the direct form was not found).
  if (!demand || !supply) {
    for (const m of src.matchAll(curveRegex('P', 'Q'))) {
      const lin = parseLinear(m[2], 'Q')
      if (!lin || lin.k === 0) continue
      // P = c + kQ  ->  Q = -c/k + (1/k) P
      const curve = { a: -lin.c / lin.k, b: 1 / lin.k, text: `P = ${m[2].replace(/\s+/g, ' ').trim()}` }
      if (lin.k < 0 && !demand) demand = curve
      else if (lin.k > 0 && !supply) supply = curve
    }
  }
  return { demand, supply }
}

function findTax(text) {
  const s = String(text || '')
  const m =
    s.match(new RegExp(`tax\\s+of\\s+\\$?\\s*(${NUM})`, 'i')) ||
    s.match(new RegExp(`\\$?\\s*(${NUM})\\s*(?:dollars?\\s+)?(?:per[-\\s]unit\\s+|a\\s+unit\\s+|unit\\s+)?tax\\b`, 'i')) ||
    s.match(new RegExp(`\\bt(?:ax)?\\s*=\\s*\\$?\\s*(${NUM})`, 'i'))
  if (!m) return null
  const t = Number(m[1])
  return Number.isFinite(t) && t > 0 ? t : null
}

/**
 * Solve a linear market described in `problemText` (falling back to the
 * student's `workText`). Returns null when no demand+supply pair is found.
 */
export function solveLinearMarket(problemText, workText = '') {
  let { demand, supply } = findCurves(problemText)
  if (!demand || !supply) {
    const fromWork = findCurves(workText)
    demand = demand || fromWork.demand
    supply = supply || fromWork.supply
  }
  if (!demand || !supply) return null

  // Qd = a + bP (b < 0), Qs = c + dP (d > 0)
  const { a, b } = demand
  const { a: c, b: d } = supply
  const denom = d - b
  if (!(denom > 0)) return null
  const P = (a - c) / denom
  const Q = a + b * P
  if (!(P > 0) || !(Q > 0) || !Number.isFinite(P) || !Number.isFinite(Q)) return null

  const rhs = (t) => t.replace(/^[^=]*=\s*/, '')
  const out = {
    demand: demand.text,
    supply: supply.text,
    P,
    Q,
    path: `set ${rhs(demand.text)} = ${rhs(supply.text)}, collect the P terms, solve to get P = ${fmt(P)}, then substitute P into either equation to get Q = ${fmt(Q)}`,
    surplus: null,
    tax: null,
  }

  const both = `${problemText}\n${workText}`
  if (/surplus|welfare|deadweight|\bCS\b|\bPS\b|\bDWL\b/i.test(both)) {
    const pMaxDemand = -a / b // price where Qd = 0
    const pMinSupply = -c / d // price where Qs = 0 (may be negative)
    const cs = 0.5 * (pMaxDemand - P) * Q
    const ps = pMinSupply >= 0 ? 0.5 * (P - pMinSupply) * Q : 0.5 * P * (Q + c)
    out.surplus = { cs, ps, pMaxDemand, pMinSupply }
  }

  const t = findTax(problemText) ?? findTax(workText)
  if (t) {
    // Buyers pay Pb, sellers keep Ps = Pb - t:  a + b*Pb = c + d*(Pb - t)
    const Pb = (a - c + d * t) / denom
    const Ps = Pb - t
    const Qt = a + b * Pb
    if (Qt > 0 && Ps > 0) {
      out.tax = { t, Pb, Ps, Q: Qt, revenue: t * Qt, dwl: 0.5 * t * (Q - Qt) }
    }
  }
  return out
}

/** Private notes handed to the model so its coaching is grounded in the right numbers. */
export function tutorNotes(sol) {
  if (!sol) return ''
  const lines = [
    `Equilibrium path: ${sol.path}.`,
    `Correct equilibrium: P = ${fmt(sol.P)}, Q = ${fmt(sol.Q)}.`,
  ]
  if (sol.surplus) {
    lines.push(
      `Consumer surplus = 1/2 x (${fmt(sol.surplus.pMaxDemand)} - ${fmt(sol.P)}) x ${fmt(sol.Q)} = ${fmt(sol.surplus.cs)}. Producer surplus = ${fmt(sol.surplus.ps)}.`
    )
  }
  if (sol.tax) {
    const x = sol.tax
    lines.push(
      `With the tax of ${fmt(x.t)}: buyers pay ${fmt(x.Pb)}, sellers keep ${fmt(x.Ps)}, quantity falls to ${fmt(x.Q)}, tax revenue = ${fmt(x.revenue)}, deadweight loss = 1/2 x ${fmt(x.t)} x (${fmt(sol.Q)} - ${fmt(x.Q)}) = ${fmt(x.dwl)}.`
    )
  }
  return lines.join('\n')
}

function numberPattern(n) {
  return fmt(n).replace('.', '\\.')
}

/**
 * Does the student's work already show the final numbers?
 * Returns null when there is no solved reference to compare against.
 */
export function workShowsAnswer(sol, workText) {
  if (!sol) return null
  const s = String(workText || '').replace(DASHES, '-')
  const has = (n) => new RegExp(`(?<![\\d.])${numberPattern(n)}(?!\\.?\\d)`).test(s)
  const pShown = new RegExp(`\\bP\\w*\\s*=\\s*\\$?\\s*${numberPattern(sol.P)}(?!\\.?\\d)`).test(s)
  const qShown = new RegExp(`\\bQ\\w*\\s*=\\s*${numberPattern(sol.Q)}(?!\\.?\\d)`).test(s)
  if (sol.tax) {
    // A tax problem is only finished once the after-tax numbers appear too.
    return pShown && qShown && has(sol.tax.Q) && (has(sol.tax.Pb) || has(sol.tax.Ps))
  }
  return pShown && qShown
}
