export interface TogetherStep {
  who: 'adam' | 'student'
  say: string
  action:
    | 'axes'
    | 'first'
    | 'label-first'
    | 'second'
    | 'equilibrium'
    | 'shift'
    | 'new-equilibrium'
    | 'ppf-frontier'
    | 'label-ppf'
    | 'inside-point'
    | 'label-inside'
    | 'outside-point'
    | 'label-outside'
    | 'ppf-growth'
    | 'ppf-finish'
}

export interface TogetherPoint {
  x: number
  y: number
}

export interface TogetherStroke {
  points: TogetherPoint[]
  width?: number
}

export interface TogetherBox {
  x: number
  y: number
  w: number
  h: number
}

export interface TogetherViewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface MarketCurveConfig {
  label: string
  slope: 'down' | 'up'
  prompt: string
  wrongMsg: string
}

export interface MarketShiftConfig {
  curve: 'first' | 'second'
  dir: 'right' | 'left'
  newLabel: string
  prompt: string
  wrongMsg: string
  doneMsg: string
}

export interface MarketLesson {
  kind: 'market'
  id: string
  title: string
  keywords: string[]
  yLabel: string
  xLabel: string
  first: MarketCurveConfig
  second: MarketCurveConfig
  eqLabels: { y: string; x: string }
  shift: MarketShiftConfig
  steps: readonly TogetherStep[]
}

export interface PpfLesson {
  kind: 'ppf'
  id: 'ppf'
  title: string
  yLabel: string
  xLabel: string
  steps: readonly TogetherStep[]
  wrongMessages: {
    bowed: string
    inside: string
    outside: string
    growth: string
  }
}

export type TogetherLesson = MarketLesson | PpfLesson

export const SUPPLY_DEMAND_LESSON: MarketLesson = {
  kind: 'market',
  id: 'supply-demand',
  title: 'Supply and demand',
  keywords: ['supply', 'demand', 'equilibrium'],
  yLabel: 'P',
  xLabel: 'Q',
  first: {
    label: 'D',
    slope: 'down',
    prompt: 'Draw demand from the upper left to the lower right.',
    wrongMsg:
      'Demand slopes down: higher price, people buy less. Try again from the upper left to the lower right.',
  },
  second: {
    label: 'S',
    slope: 'up',
    prompt: 'Draw supply from the lower left to the upper right.',
    wrongMsg:
      'Supply slopes up: higher prices encourage more supply. Try again from the lower left to the upper right.',
  },
  eqLabels: { y: 'P*', x: 'Q*' },
  shift: {
    curve: 'first',
    dir: 'right',
    newLabel: 'D₂',
    prompt:
      'They cross at the equilibrium. Now show what happens if demand increases: draw the new demand curve.',
    wrongMsg: 'An increase in demand shifts the curve right.',
    doneMsg: 'Price and quantity both rise. Nice work!',
  },
  steps: [
    { who: 'adam', action: 'axes', say: "I'll draw the axes. Your turn: draw the demand curve." },
    { who: 'student', action: 'first', say: 'Draw demand from the upper left to the lower right.' },
    { who: 'adam', action: 'label-first', say: 'Now draw supply.' },
    { who: 'student', action: 'second', say: 'Draw supply from the lower left to the upper right.' },
    {
      who: 'adam',
      action: 'equilibrium',
      say: 'They cross at the equilibrium. Now show what happens if demand increases: draw the new demand curve.',
    },
    {
      who: 'student',
      action: 'shift',
      say: 'Draw a new demand curve shifted to the right or above the first one.',
    },
    { who: 'adam', action: 'new-equilibrium', say: 'Price and quantity both rise. Nice work!' },
  ],
}

export const FX_LESSON: MarketLesson = {
  kind: 'market',
  id: 'fx',
  title: 'Market for dollars',
  keywords: ['exchange rate', 'currency', 'forex', 'dollar', 'euro', 'yen', 'peso', '€', '£', '¥'],
  yLabel: '€ per $',
  xLabel: 'Q of $',
  first: {
    label: 'D for $',
    slope: 'down',
    prompt: 'Draw demand for dollars from the upper left to the lower right.',
    wrongMsg: 'Demand for dollars slopes down. Try again from the upper left to the lower right.',
  },
  second: {
    label: 'S for $',
    slope: 'up',
    prompt: 'Draw supply of dollars from the lower left to the upper right.',
    wrongMsg: 'Supply of dollars slopes up. Try again from the lower left to the upper right.',
  },
  eqLabels: { y: 'e*', x: 'Q*' },
  shift: {
    curve: 'first',
    dir: 'right',
    newLabel: 'D₂',
    prompt:
      'US interest rates rise, so foreign savers want more dollars. Draw the new demand for dollars.',
    wrongMsg: 'More demand for dollars shifts the curve right.',
    doneMsg: 'The dollar appreciates: each dollar buys more euros.',
  },
  steps: [
    { who: 'adam', action: 'axes', say: "I'll draw the axes. Your turn: draw demand for dollars." },
    { who: 'student', action: 'first', say: 'Draw demand for dollars from the upper left to the lower right.' },
    { who: 'adam', action: 'label-first', say: 'Now draw supply of dollars.' },
    { who: 'student', action: 'second', say: 'Draw supply of dollars from the lower left to the upper right.' },
    { who: 'adam', action: 'equilibrium', say: 'They cross at e*. ' + 'US interest rates rise, so foreign savers want more dollars. Draw the new demand for dollars.' },
    { who: 'student', action: 'shift', say: 'Draw the new demand curve shifted to the right.' },
    { who: 'adam', action: 'new-equilibrium', say: 'The dollar appreciates: each dollar buys more euros.' },
  ],
}

export const LOANABLE_FUNDS_LESSON: MarketLesson = {
  kind: 'market',
  id: 'loanable-funds',
  title: 'Loanable funds',
  keywords: ['loanable', 'national saving', 'crowding out', 'budget deficit'],
  yLabel: 'r',
  xLabel: 'Q of loanable funds',
  first: {
    label: 'D (investment)',
    slope: 'down',
    prompt: 'Draw demand for loanable funds (investment), sloping down.',
    wrongMsg:
      'Demand for loanable funds slopes down. Try again from the upper left to the lower right.',
  },
  second: {
    label: 'S (saving)',
    slope: 'up',
    prompt: 'Draw supply of loanable funds (saving), sloping up.',
    wrongMsg:
      'Supply of loanable funds slopes up. Try again from the lower left to the upper right.',
  },
  eqLabels: { y: 'r*', x: 'Q*' },
  shift: {
    curve: 'second',
    dir: 'left',
    newLabel: 'S₂',
    prompt: 'The government runs a deficit, so national saving falls. Draw the new supply curve.',
    wrongMsg: 'Less saving shifts the supply of loanable funds left.',
    doneMsg: "The interest rate rises and private investment falls. That's crowding out.",
  },
  steps: [
    { who: 'adam', action: 'axes', say: "I'll draw the axes. Your turn: draw demand for investment." },
    { who: 'student', action: 'first', say: 'Draw demand for loanable funds (investment), sloping down.' },
    { who: 'adam', action: 'label-first', say: 'Now draw supply from saving.' },
    { who: 'student', action: 'second', say: 'Draw supply of loanable funds (saving), sloping up.' },
    {
      who: 'adam',
      action: 'equilibrium',
      say: 'They cross at the equilibrium. The government runs a deficit, so national saving falls. Draw the new supply curve.',
    },
    { who: 'student', action: 'shift', say: 'Draw the new supply curve shifted to the left.' },
    {
      who: 'adam',
      action: 'new-equilibrium',
      say: "The interest rate rises and private investment falls. That's crowding out.",
    },
  ],
}

export const BONDS_LESSON: MarketLesson = {
  kind: 'market',
  id: 'bonds',
  title: 'Bond market',
  keywords: ['bond', 'bonds'],
  yLabel: 'Price of bonds',
  xLabel: 'Q of bonds',
  first: {
    label: 'D bonds',
    slope: 'down',
    prompt: 'Draw demand for bonds, sloping down.',
    wrongMsg: 'Demand for bonds slopes down. Try again from the upper left to the lower right.',
  },
  second: {
    label: 'S bonds',
    slope: 'up',
    prompt: 'Draw supply of bonds, sloping up.',
    wrongMsg: 'Supply of bonds slopes up. Try again from the lower left to the upper right.',
  },
  eqLabels: { y: 'Pb*', x: 'Qb*' },
  shift: {
    curve: 'first',
    dir: 'right',
    newLabel: 'D₂',
    prompt: 'The Fed buys bonds in an open-market purchase. Draw the new demand for bonds.',
    wrongMsg: 'The Fed buying adds demand, so the curve shifts right.',
    doneMsg: 'Bond prices rise, so interest rates fall.',
  },
  steps: [
    { who: 'adam', action: 'axes', say: "I'll draw the axes. Your turn: draw demand for bonds." },
    { who: 'student', action: 'first', say: 'Draw demand for bonds, sloping down.' },
    { who: 'adam', action: 'label-first', say: 'Now draw supply of bonds.' },
    { who: 'student', action: 'second', say: 'Draw supply of bonds, sloping up.' },
    {
      who: 'adam',
      action: 'equilibrium',
      say: 'They cross at the equilibrium. The Fed buys bonds in an open-market purchase. Draw the new demand for bonds.',
    },
    { who: 'student', action: 'shift', say: 'Draw the new demand curve shifted to the right.' },
    { who: 'adam', action: 'new-equilibrium', say: 'Bond prices rise, so interest rates fall.' },
  ],
}

export const PPF_LESSON: PpfLesson = {
  kind: 'ppf',
  id: 'ppf',
  title: 'Production possibilities frontier',
  yLabel: 'Capital goods',
  xLabel: 'Consumer goods',
  steps: [
    {
      who: 'adam',
      action: 'axes',
      say: 'Draw the production possibilities frontier from the top axis to the bottom axis.',
    },
    {
      who: 'student',
      action: 'ppf-frontier',
      say: 'Draw the frontier from the top axis to the bottom axis.',
    },
    { who: 'adam', action: 'label-ppf', say: 'Mark a point inside the curve.' },
    { who: 'student', action: 'inside-point', say: 'Mark a point inside the curve.' },
    { who: 'adam', action: 'label-inside', say: 'Now mark a point outside the curve.' },
    {
      who: 'student',
      action: 'outside-point',
      say: 'Mark a point outside the curve.',
    },
    {
      who: 'student',
      action: 'ppf-growth',
      say: 'Now show economic growth: draw the new PPF farther from the origin.',
    },
    {
      who: 'adam',
      action: 'ppf-finish',
      say: 'Growth shifts the PPF out, so B becomes attainable.',
    },
  ],
  wrongMessages: {
    bowed:
      'Bow it outward: each extra unit costs more and more of the other good (increasing opportunity cost).',
    inside: "That's not inside. Inside means some resources sit idle.",
    outside: "That's not outside the curve. Try a point beyond today's resources.",
    growth: 'Growth shifts the PPF out, away from the origin.',
  },
}

export const TOGETHER_LESSONS: readonly TogetherLesson[] = [
  SUPPLY_DEMAND_LESSON,
  FX_LESSON,
  LOANABLE_FUNDS_LESSON,
  BONDS_LESSON,
  PPF_LESSON,
]

export function lessonById(id: string): TogetherLesson | undefined {
  return TOGETHER_LESSONS.find((lesson) => lesson.id === id)
}

export function pickTogetherLesson(text: string): TogetherLesson {
  const value = text.toLocaleLowerCase()
  if (/ppf|production possibilit/.test(value)) return PPF_LESSON
  if (/exchange rate|currency|forex|dollar|euro|yen|peso|€|£|¥/.test(value)) return FX_LESSON
  if (/loanable|national saving|crowding out|budget deficit/.test(value)) return LOANABLE_FUNDS_LESSON
  if (/\bbonds?\b/.test(value)) return BONDS_LESSON
  return SUPPLY_DEMAND_LESSON
}

export function hasStrokeSlope(stroke: TogetherStroke, direction: 'up' | 'down'): boolean {
  if (stroke.points.length < 2) return false
  const first = stroke.points[0]
  const last = stroke.points[stroke.points.length - 1]
  const left = first.x <= last.x ? first : last
  const right = first.x <= last.x ? last : first
  const dx = right.x - left.x
  const dy = right.y - left.y
  if (dx < 1 || Math.abs(dy) < dx * 0.08) return false
  return direction === 'down' ? dy > 0 : dy < 0
}

export function strokeFitsBox(stroke: TogetherStroke, box: TogetherBox, minWidth = 0.35): boolean {
  if (stroke.points.length < 2) return false
  const xs = stroke.points.map((point) => point.x)
  const width = Math.max(...xs) - Math.min(...xs)
  if (width < box.w * minWidth) return false
  const slackX = box.w * 0.15
  const slackY = box.h * 0.15
  const insideCount = stroke.points.filter(
    (point) =>
      point.x >= box.x - slackX &&
      point.x <= box.x + box.w + slackX &&
      point.y >= box.y - slackY &&
      point.y <= box.y + box.h + slackY
  ).length
  return insideCount / stroke.points.length >= 0.8
}

export function isValidCurveStroke(
  stroke: TogetherStroke,
  box: TogetherBox,
  direction: 'up' | 'down'
): boolean {
  return strokeFitsBox(stroke, box) && hasStrokeSlope(stroke, direction)
}

function segmentIntersectsRect(
  start: TogetherPoint,
  end: TogetherPoint,
  rect: { left: number; right: number; top: number; bottom: number }
): boolean {
  const dx = end.x - start.x
  const dy = end.y - start.y
  let lower = 0
  let upper = 1
  const p = [-dx, dx, -dy, dy]
  const q = [
    start.x - rect.left,
    rect.right - start.x,
    start.y - rect.top,
    rect.bottom - start.y,
  ]
  for (let i = 0; i < p.length; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
      continue
    }
    const t = q[i] / p[i]
    if (p[i] < 0) {
      if (t > upper) return false
      lower = Math.max(lower, t)
    } else {
      if (t < lower) return false
      upper = Math.min(upper, t)
    }
  }
  return true
}

export function labelOverlapsStroke(
  position: TogetherPoint,
  text: string,
  stroke: TogetherStroke,
  fontSize = 16
): boolean {
  if (stroke.points.length === 0) return false
  const padding = Math.max(4, (stroke.width ?? 2) / 2 + 3)
  const rect = {
    left: position.x - padding,
    right: position.x + text.length * fontSize * 0.65 + padding,
    top: position.y - fontSize - padding,
    bottom: position.y + fontSize * 0.25 + padding,
  }
  if (stroke.points.length === 1) {
    const [point] = stroke.points
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  }
  for (let i = 1; i < stroke.points.length; i++) {
    if (segmentIntersectsRect(stroke.points[i - 1], stroke.points[i], rect)) return true
  }
  return false
}

export function placeLabelAwayFromStrokes(
  preferred: TogetherPoint,
  text: string,
  strokes: readonly TogetherStroke[],
  fontSize = 16,
  viewport?: TogetherViewport
): TogetherPoint {
  const step = Math.max(10, fontSize * 0.85)
  const directions = [
    { x: 0, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  ]
  let best = preferred
  let bestOverlapCount = Number.POSITIVE_INFINITY
  let bestDistance = Number.POSITIVE_INFINITY
  let bestFitsViewport = false
  for (let ring = 0; ring <= 3; ring++) {
    for (const direction of directions) {
      const candidate = {
        x: preferred.x + direction.x * step * ring,
        y: preferred.y + direction.y * step * ring,
      }
      const overlapCount = strokes.filter((stroke) =>
        labelOverlapsStroke(candidate, text, stroke, fontSize)
      ).length
      const fitsViewport =
        !viewport ||
        (candidate.x >= viewport.minX &&
          candidate.x + text.length * fontSize * 0.65 <= viewport.maxX &&
          candidate.y - fontSize >= viewport.minY &&
          candidate.y + fontSize * 0.25 <= viewport.maxY)
      if (overlapCount === 0 && fitsViewport) return candidate
      const distance = Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y)
      if (
        (fitsViewport && !bestFitsViewport) ||
        (fitsViewport === bestFitsViewport &&
          (overlapCount < bestOverlapCount ||
            (overlapCount === bestOverlapCount && distance < bestDistance)))
      ) {
        best = candidate
        bestOverlapCount = overlapCount
        bestDistance = distance
        bestFitsViewport = fitsViewport
      }
    }
  }
  return best
}

export function pointLabelPosition(
  anchor: TogetherPoint,
  text: string,
  fontSize: number,
  viewport: TogetherViewport
): TogetherPoint {
  const width = text.length * fontSize * 0.65
  let x = anchor.x + 8
  if (x + width > viewport.maxX) x = anchor.x - width - 8
  if (x < viewport.minX) x = viewport.minX + 4

  let y = anchor.y + 4
  if (y - fontSize < viewport.minY) y = anchor.y + fontSize + 4
  y = Math.min(y, viewport.maxY - fontSize * 0.25 - 4)
  return { x, y }
}

export function shiftedEquilibriumLabel(label: string): string {
  return `${label.replace(/\*$/, '')}₂`
}

export function strokeMidpoint(stroke: TogetherStroke): TogetherPoint | null {
  if (stroke.points.length === 0) return null
  if (stroke.points.length === 1) return { ...stroke.points[0] }
  let totalLength = 0
  for (let i = 1; i < stroke.points.length; i++) {
    totalLength += Math.hypot(
      stroke.points[i].x - stroke.points[i - 1].x,
      stroke.points[i].y - stroke.points[i - 1].y
    )
  }
  if (totalLength === 0) return { ...stroke.points[0] }
  let remaining = totalLength / 2
  for (let i = 1; i < stroke.points.length; i++) {
    const start = stroke.points[i - 1]
    const end = stroke.points[i]
    const segment = Math.hypot(end.x - start.x, end.y - start.y)
    if (remaining <= segment) {
      const t = remaining / segment
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
    }
    remaining -= segment
  }
  return { ...stroke.points[stroke.points.length - 1] }
}

export function isCurveShifted(
  original: TogetherStroke,
  next: TogetherStroke,
  direction: 'right' | 'left',
  box: TogetherBox
): boolean {
  const before = strokeMidpoint(original)
  const after = strokeMidpoint(next)
  if (!before || !after) return false
  const threshold = box.w * 0.06
  return direction === 'right'
    ? after.x >= before.x + threshold
    : after.x <= before.x - threshold
}

function cross(a: TogetherPoint, b: TogetherPoint): number {
  return a.x * b.y - a.y * b.x
}

export function polylineIntersection(
  first: TogetherPoint[],
  second: TogetherPoint[]
): TogetherPoint | null {
  for (let i = 1; i < first.length; i++) {
    const a = first[i - 1]
    const b = first[i]
    const r = { x: b.x - a.x, y: b.y - a.y }
    for (let j = 1; j < second.length; j++) {
      const c = second[j - 1]
      const d = second[j]
      const s = { x: d.x - c.x, y: d.y - c.y }
      const denominator = cross(r, s)
      if (Math.abs(denominator) < 1e-9) continue
      const offset = { x: c.x - a.x, y: c.y - a.y }
      const t = cross(offset, s) / denominator
      const u = cross(offset, r) / denominator
      if (t < 0 || t > 1 || u < 0 || u > 1) continue
      return { x: a.x + t * r.x, y: a.y + t * r.y }
    }
  }
  return null
}

function project(point: TogetherPoint, start: TogetherPoint, end: TogetherPoint): TogetherPoint {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { ...start }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  )
  return { x: start.x + t * dx, y: start.y + t * dy }
}

export function nearestPolylineApproach(
  first: TogetherPoint[],
  second: TogetherPoint[]
): TogetherPoint | null {
  if (first.length === 0 || second.length === 0) return null
  let bestDistance = Number.POSITIVE_INFINITY
  let best: TogetherPoint | null = null
  const consider = (a: TogetherPoint, b: TogetherPoint) => {
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
  }
  const firstSegments = first.length > 1 ? first.length - 1 : 1
  const secondSegments = second.length > 1 ? second.length - 1 : 1
  for (const point of first) {
    for (let i = 0; i < secondSegments; i++) {
      consider(point, second.length > 1 ? project(point, second[i], second[i + 1]) : second[0])
    }
  }
  for (const point of second) {
    for (let i = 0; i < firstSegments; i++) {
      consider(first.length > 1 ? project(point, first[i], first[i + 1]) : first[0], point)
    }
  }
  return best
}

export function curveEquilibrium(
  first: TogetherPoint[] | null,
  second: TogetherPoint[] | null,
  box: TogetherBox
): TogetherPoint {
  const point =
    first && second
      ? polylineIntersection(first, second) ?? nearestPolylineApproach(first, second)
      : null
  return point ?? { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

export function equilibriumLabelPositions(
  box: TogetherBox,
  point: TogetherPoint,
  priceLabel: string,
  quantityLabel: string,
  otherPoint?: TogetherPoint
): { price: TogetherPoint; quantity: TogetherPoint } {
  const left = box.x + 42
  const bottom = box.y + box.h - 26
  const priceWidth = priceLabel.length * 13 * 0.65
  const quantityWidth = quantityLabel.length * 13 * 0.65
  const priceCollides = otherPoint !== undefined && Math.abs(point.y - otherPoint.y) < 19
  const quantityCollides =
    otherPoint !== undefined && Math.abs(point.x - otherPoint.x) < quantityWidth + 10
  return {
    price: {
      x: left - priceWidth - (priceCollides ? 28 : 10),
      y: point.y + 4,
    },
    quantity: {
      x: point.x - quantityWidth / 2,
      y: bottom + 19 + (quantityCollides ? 20 : 0),
    },
  }
}

function axesFor(box: TogetherBox) {
  return {
    left: box.x + 42,
    top: box.y + 22,
    right: box.x + box.w - 14,
    bottom: box.y + box.h - 26,
  }
}

export function ppfBulgePoint(stroke: TogetherStroke): TogetherPoint | null {
  if (stroke.points.length < 3) return null
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const chord = { x: end.x - start.x, y: end.y - start.y }
  const length = Math.hypot(chord.x, chord.y)
  if (length < 1) return null
  let bulge: TogetherPoint | null = null
  let distance = -1
  for (const point of stroke.points.slice(1, -1)) {
    const current = Math.abs(cross(chord, { x: point.x - start.x, y: point.y - start.y })) / length
    if (current > distance) {
      distance = current
      bulge = point
    }
  }
  return bulge ? { ...bulge } : null
}

export function isBowedOut(stroke: TogetherStroke, box: TogetherBox): boolean {
  const bulge = ppfBulgePoint(stroke)
  if (!bulge) return false
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const chord = { x: end.x - start.x, y: end.y - start.y }
  const origin = { x: box.x + 42, y: box.y + box.h - 26 }
  const originSide = cross(chord, { x: origin.x - start.x, y: origin.y - start.y })
  const bulgeSide = cross(chord, { x: bulge.x - start.x, y: bulge.y - start.y })
  const threshold = Math.hypot(box.w, box.h) * 0.05
  const distance = Math.abs(bulgeSide) / Math.hypot(chord.x, chord.y)
  return originSide !== 0 && bulgeSide !== 0 && Math.sign(originSide) !== Math.sign(bulgeSide) && distance >= threshold
}

export function isPpfCurve(stroke: TogetherStroke, box: TogetherBox): boolean {
  if (stroke.points.length < 3) return false
  const { left, top, right, bottom } = axesFor(box)
  const start = stroke.points[0]
  const end = stroke.points[stroke.points.length - 1]
  const endpointsFit =
    Math.abs(start.x - left) <= box.w * 0.2 &&
    Math.abs(start.y - top) <= box.h * 0.2 &&
    Math.abs(end.y - bottom) <= box.h * 0.2 &&
    end.x >= left + box.w * 0.35 &&
    end.x <= right + box.w * 0.15
  return endpointsFit && isBowedOut(stroke, box)
}

export function isPpfGrowth(
  original: TogetherStroke,
  next: TogetherStroke,
  box: TogetherBox
): boolean {
  if (!isPpfCurve(original, box) || !isPpfCurve(next, box)) return false
  const before = ppfBulgePoint(original)
  const after = ppfBulgePoint(next)
  if (!before || !after) return false
  const origin = { x: box.x + 42, y: box.y + box.h - 26 }
  return Math.hypot(after.x - origin.x, after.y - origin.y) >
    Math.hypot(before.x - origin.x, before.y - origin.y)
}

function strokeCenter(stroke: TogetherStroke): TogetherPoint | null {
  if (stroke.points.length === 0) return null
  const count = stroke.points.length
  return {
    x: stroke.points.reduce((sum, point) => sum + point.x, 0) / count,
    y: stroke.points.reduce((sum, point) => sum + point.y, 0) / count,
  }
}

function pointToPolylineDistance(point: TogetherPoint, line: TogetherPoint[]): number {
  let minimum = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
    minimum = Math.min(minimum, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy))
  }
  return minimum
}

function pointInPolygon(point: TogetherPoint, polygon: TogetherPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

export function isPointRelativeToCurve(
  pointStroke: TogetherStroke,
  curve: TogetherStroke,
  box: TogetherBox,
  side: 'inside' | 'outside',
  zoom = 1
): boolean {
  if (pointStroke.points.length === 0) return false
  const xs = pointStroke.points.map((point) => point.x)
  const ys = pointStroke.points.map((point) => point.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  const screenMarkLimit = 100 / Math.max(zoom, 0.01)
  if (
    width > Math.max(box.w * 0.24, screenMarkLimit) ||
    height > Math.max(box.h * 0.24, screenMarkLimit)
  ) {
    return false
  }
  const point = strokeCenter(pointStroke)
  if (!point) return false
  const { left, bottom } = axesFor(box)
  const axisMargin = Math.max(8, Math.hypot(box.w, box.h) * 0.02)
  if (point.x < left - axisMargin || point.y > bottom + axisMargin) return false
  if (curve.points.length < 2) return false

  const points =
    Math.abs(curve.points[0].x - left) <= Math.abs(curve.points[curve.points.length - 1].x - left)
      ? curve.points
      : [...curve.points].reverse()
  if (pointToPolylineDistance(point, points) < axisMargin) return false
  const start = points[0]
  const end = points[points.length - 1]
  const polygon = [
    { x: left, y: bottom },
    { x: left, y: start.y },
    ...points,
    { x: end.x, y: bottom },
  ]
  const inside = pointInPolygon(point, polygon)
  return side === 'inside' ? inside : !inside
}

export function replaceCorrectionOpIds(
  previous: string[],
  next: string[]
): { remove: string[]; active: string[] } {
  return { remove: [...previous], active: [...next] }
}
