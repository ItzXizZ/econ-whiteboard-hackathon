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

export interface TogetherRecapCopy {
  headline: string
  takeaways: readonly [string, string, string]
  practice: string
  answer: string
}

export interface TogetherRecapGraph {
  box: TogetherBox
  strokes: {
    points: TogetherPoint[]
    color: string
    width: number
    dashed?: boolean
  }[]
  labels: { x: number; y: number; text: string; color: string; size: number }[]
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
  recap: TogetherRecapCopy
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
  recap: TogetherRecapCopy
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

export type TogetherNeed =
  | 'first'
  | 'second'
  | 'shift'
  | 'ppf-frontier'
  | 'inside-point'
  | 'outside-point'
  | 'ppf-growth'

export interface TogetherGuideSession {
  box: TogetherBox
  first?: TogetherStroke
  second?: TogetherStroke
  frontier?: TogetherStroke
}

export interface TogetherGhostGuide {
  kind: 'curve' | 'point'
  points: TogetherPoint[]
}

export const SUPPLY_DEMAND_LESSON: MarketLesson = {
  kind: 'market',
  id: 'supply-demand',
  title: 'Supply and demand',
  recap: {
    headline: 'You built a supply and demand market',
    takeaways: [
      'Demand slopes down: at higher prices, people buy less.',
      'Supply slopes up: higher prices make producers offer more.',
      'When demand increases, D shifts right, so equilibrium price and quantity both rise.',
    ],
    practice: 'A drought cuts the wheat harvest. What happens to the equilibrium price and quantity of wheat?',
    answer: 'Supply shifts left, so the price rises and the quantity falls.',
  },
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
  recap: {
    headline: 'You built the market for dollars',
    takeaways: [
      'Demand for dollars slopes down: a cheaper dollar makes US goods and assets cheaper for foreigners.',
      'Supply of dollars slopes up: a stronger dollar makes foreign goods cheaper, so Americans sell more dollars.',
      'Higher US interest rates raise demand for dollars, so the dollar appreciates.',
    ],
    practice: 'Americans start buying many more European cars. What happens to the value of the dollar in euros?',
    answer: 'Americans sell dollars to buy euros, so the supply of dollars shifts right and the dollar depreciates.',
  },
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
  recap: {
    headline: 'You built the loanable funds market',
    takeaways: [
      'Saving supplies loanable funds; investment demands them.',
      'The real interest rate balances saving and investment.',
      'A budget deficit lowers national saving, so the interest rate rises and private investment falls: crowding out.',
    ],
    practice: 'The government adds a new tax credit for business investment. What happens to the interest rate and the quantity of loanable funds?',
    answer: 'Investment demand shifts right, so the interest rate rises and the quantity of loanable funds rises.',
  },
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
  recap: {
    headline: 'You built the bond market',
    takeaways: [
      'Bond prices and interest rates move in opposite directions.',
      'When the Fed buys bonds, demand for bonds shifts right.',
      'Bond prices rise, so interest rates fall: expansionary monetary policy.',
    ],
    practice: 'The Fed sells bonds in an open-market sale. What happens to bond prices and interest rates?',
    answer: 'More bonds come onto the market, so bond prices fall and interest rates rise.',
  },
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
  recap: {
    headline: 'You built a production possibilities frontier',
    takeaways: [
      'Points on the PPF are efficient; points inside it leave resources unused.',
      "Points outside the PPF can't be reached with today's resources and technology.",
      'Economic growth shifts the PPF outward, so once-unattainable points become possible.',
    ],
    practice: 'A country on its PPF decides to produce more capital goods. What does it give up, and why does each extra unit cost more?',
    answer: "It gives up consumer goods. Resources aren't equally suited to both, so the opportunity cost rises as it specializes: that's why the PPF bows out.",
  },
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
  return matchTogetherLesson(text) ?? SUPPLY_DEMAND_LESSON
}

export function matchTogetherLesson(text: string): TogetherLesson | null {
  const value = text.toLocaleLowerCase()
  if (/ppf|production possibilit|opportunity cost/.test(value)) return PPF_LESSON
  if (/exchange rate|currency|forex|dollar|euro|yen|peso|appreciat|depreciat|€|£|¥/.test(value)) return FX_LESSON
  if (/loanable|national saving|crowding out|budget deficit/.test(value)) return LOANABLE_FUNDS_LESSON
  if (/\bbonds?\b|open market|bond price/.test(value)) return BONDS_LESSON
  if (/\bsupply\b|\bdemand\b|\bequilibrium\b/.test(value)) return SUPPLY_DEMAND_LESSON
  return null
}

export function togetherLessonRationale(text: string): string | null {
  const lesson = matchTogetherLesson(text)
  if (!lesson || lesson.id === SUPPLY_DEMAND_LESSON.id) return null
  const value = text.toLocaleLowerCase()
  const topic =
    /\bbudget deficit\b/.test(value) ? 'a budget deficit'
      : /\bopportunity cost\b/.test(value) ? 'opportunity cost'
        : /appreciat|depreciat/.test(value) ? 'a currency change'
          : /exchange rate/.test(value) ? 'an exchange rate'
            : /open market|bond price|\bbonds?\b/.test(value) ? 'bonds'
              : /loanable|national saving|crowding out/.test(value) ? 'loanable funds'
                : /production possibilit|ppf/.test(value) ? 'production possibilities'
                  : lesson.title.toLocaleLowerCase()
  return `This problem is about ${topic}, so let's draw the ${lesson.title.toLocaleLowerCase()}.`
}

export function splitWorksheetQuestions(text: string): string[] {
  const normalized = text.replace(/\r/g, '\n').trim()
  if (!normalized) return []
  const markers = [...normalized.matchAll(/(?:^|\s)(\d+[.)])\s+/g)]
  const matches =
    markers.length > 0
      ? markers
      : [...normalized.matchAll(/(?:^|\n)\s*(\([a-z]\)|[a-z][.)])\s+/gi)]
  if (matches.length === 0) return [normalized]
  const starts = matches.map((match) => match.index! + match[0].search(/\S/))
  return starts
    .map((start, index) => {
      const end = starts[index + 1] ?? normalized.length
      return normalized.slice(start, end).replace(/^\s*(?:\d+[.)]|\([a-z]\)|[a-z][.)])\s*/i, '').trim()
    })
    .filter(Boolean)
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

export function resampleStroke(points: TogetherPoint[], count = 48): TogetherPoint[] {
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: count }, () => ({ ...points[0] }))
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  const total = lengths[lengths.length - 1]
  if (total === 0) return Array.from({ length: count }, () => ({ ...points[0] }))
  const output: TogetherPoint[] = []
  let segment = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (segment < lengths.length - 1 && lengths[segment] < target) segment++
    const start = points[segment - 1]
    const end = points[segment]
    const span = lengths[segment] - lengths[segment - 1]
    const t = span === 0 ? 0 : (target - lengths[segment - 1]) / span
    output.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    })
  }
  output[0] = { ...points[0] }
  output[output.length - 1] = { ...points[points.length - 1] }
  return output
}

function chaikin(points: TogetherPoint[]): TogetherPoint[] {
  if (points.length < 3) return points.map((point) => ({ ...point }))
  const output = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    output.push(
      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }
    )
  }
  output.push({ ...points[points.length - 1] })
  return output
}

export function beautifyStroke(points: TogetherPoint[], kind: 'line' | 'curve'): TogetherPoint[] {
  const source = resampleStroke(points)
  if (source.length < 3) return source
  let shape = source
  if (kind === 'line') {
    const center = source.reduce(
      (sum, point) => ({ x: sum.x + point.x / source.length, y: sum.y + point.y / source.length }),
      { x: 0, y: 0 }
    )
    let xx = 0
    let xy = 0
    let yy = 0
    for (const point of source) {
      const x = point.x - center.x
      const y = point.y - center.y
      xx += x * x
      xy += x * y
      yy += y * y
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
    let direction = { x: Math.cos(angle), y: Math.sin(angle) }
    const original = { x: source[source.length - 1].x - source[0].x, y: source[source.length - 1].y - source[0].y }
    if (direction.x * original.x + direction.y * original.y < 0) {
      direction = { x: -direction.x, y: -direction.y }
    }
    const normal = { x: -direction.y, y: direction.x }
    let maxResidual = 0
    for (const point of source) {
      maxResidual = Math.max(
        maxResidual,
        Math.abs((point.x - center.x) * normal.x + (point.y - center.y) * normal.y)
      )
    }
    const strokeLength = Math.hypot(original.x, original.y)
    if (strokeLength > 0 && maxResidual < strokeLength * 0.06) {
      const projectEndpoint = (point: TogetherPoint) => {
        const distance = (point.x - center.x) * direction.x + (point.y - center.y) * direction.y
        return { x: center.x + distance * direction.x, y: center.y + distance * direction.y }
      }
      const start = projectEndpoint(source[0])
      const end = projectEndpoint(source[source.length - 1])
      return Array.from({ length: 48 }, (_, i) => {
        const t = i / 47
        return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
      })
    }
  }
  for (let i = 0; i < 3; i++) shape = chaikin(shape)
  const smoothed = resampleStroke(shape)
  smoothed[0] = { ...points[0] }
  smoothed[smoothed.length - 1] = { ...points[points.length - 1] }
  return smoothed
}

export function mirrorStrokeHorizontally(stroke: TogetherStroke): TogetherPoint[] {
  if (stroke.points.length === 0) return []
  const xs = stroke.points.map((point) => point.x)
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2
  return stroke.points.map((point) => ({ x: axis * 2 - point.x, y: point.y }))
}

export function fitGhostGuideToStroke(
  guide: TogetherGhostGuide,
  stroke: TogetherStroke
): TogetherPoint[] {
  if (guide.points.length === 0 || stroke.points.length === 0) return []
  const strokeXs = stroke.points.map((point) => point.x)
  const strokeYs = stroke.points.map((point) => point.y)
  const guideXs = guide.points.map((point) => point.x)
  const guideYs = guide.points.map((point) => point.y)
  const strokeBounds = {
    minX: Math.min(...strokeXs),
    maxX: Math.max(...strokeXs),
    minY: Math.min(...strokeYs),
    maxY: Math.max(...strokeYs),
  }
  if (guide.kind === 'point') {
    const guideCenter = guide.points.reduce(
      (sum, point) => ({ x: sum.x + point.x / guide.points.length, y: sum.y + point.y / guide.points.length }),
      { x: 0, y: 0 }
    )
    const strokeCenter = stroke.points.reduce(
      (sum, point) => ({ x: sum.x + point.x / stroke.points.length, y: sum.y + point.y / stroke.points.length }),
      { x: 0, y: 0 }
    )
    return stroke.points.map((point) => ({
      x: point.x + guideCenter.x - strokeCenter.x,
      y: point.y + guideCenter.y - strokeCenter.y,
    }))
  }
  const guideBounds = {
    minX: Math.min(...guideXs),
    maxX: Math.max(...guideXs),
    minY: Math.min(...guideYs),
    maxY: Math.max(...guideYs),
  }
  const guideWidth = guideBounds.maxX - guideBounds.minX
  const guideHeight = guideBounds.maxY - guideBounds.minY
  const strokeWidth = strokeBounds.maxX - strokeBounds.minX
  const strokeHeight = strokeBounds.maxY - strokeBounds.minY
  return guide.points.map((point) => ({
    x: strokeBounds.minX +
      ((point.x - guideBounds.minX) / (guideWidth || 1)) * strokeWidth,
    y: strokeBounds.minY +
      ((point.y - guideBounds.minY) / (guideHeight || 1)) * strokeHeight,
  }))
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

function marketGuideCurve(curve: MarketCurveConfig, box: TogetherBox): TogetherPoint[] {
  const { left, top, right, bottom } = axesFor(box)
  return curve.slope === 'down'
    ? [
        { x: left + 12, y: top + 14 },
        { x: left + box.w * 0.38, y: top + box.h * 0.4 },
        { x: right - 12, y: bottom - 14 },
      ]
    : [
        { x: left + 12, y: bottom - 14 },
        { x: left + box.w * 0.38, y: top + box.h * 0.6 },
        { x: right - 12, y: top + 14 },
      ]
}

function ppfGuideCurve(box: TogetherBox, growth: boolean): TogetherPoint[] {
  const { left, top, right, bottom } = axesFor(box)
  return [
    { x: left + 3, y: top + 8 },
    { x: left + box.w * 0.22, y: top + box.h * (growth ? 0.08 : 0.16) },
    { x: left + box.w * 0.48, y: top + box.h * (growth ? 0.025 : 0.19) },
    { x: left + box.w * 0.73, y: top + box.h * (growth ? 0.13 : 0.43) },
    { x: right - 10, y: bottom - 2 },
  ]
}

function yOnPolyline(points: TogetherPoint[], x: number): number {
  const ordered = [...points].sort((a, b) => a.x - b.x)
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1]
    const b = ordered[i]
    if (x > b.x) continue
    const t = (x - a.x) / (b.x - a.x || 1)
    return a.y + (b.y - a.y) * t
  }
  return ordered[ordered.length - 1]?.y ?? 0
}

export function ghostGuideFor(
  lesson: TogetherLesson,
  need: TogetherNeed,
  session: TogetherGuideSession
): TogetherGhostGuide | null {
  const { box } = session
  if (lesson.kind === 'market') {
    if (need === 'first' || need === 'second') {
      const curve = need === 'first' ? lesson.first : lesson.second
      return { kind: 'curve', points: marketGuideCurve(curve, box) }
    }
    if (need === 'shift') {
      const shift = lesson.shift
      const baseStroke = shift.curve === 'first' ? session.first : session.second
      const base = baseStroke?.points ?? marketGuideCurve(
        shift.curve === 'first' ? lesson.first : lesson.second,
        box
      )
      const dx = box.w * 0.11 * (shift.dir === 'right' ? 1 : -1)
      return { kind: 'curve', points: base.map((point) => ({ x: point.x + dx, y: point.y })) }
    }
    return null
  }

  if (need === 'ppf-frontier' || need === 'ppf-growth') {
    return { kind: 'curve', points: ppfGuideCurve(box, need === 'ppf-growth') }
  }

  if ((need === 'inside-point' || need === 'outside-point') && session.frontier) {
    const { left, top, bottom } = axesFor(box)
    const x = left + box.w * (need === 'inside-point' ? 0.12 : 0.76)
    const curveY = yOnPolyline(session.frontier.points, x)
    const y =
      need === 'inside-point'
        ? bottom - box.h * 0.07
        : Math.max(top + 5, curveY - box.h * 0.16)
    return { kind: 'point', points: [{ x: x - 4, y }, { x: x + 4, y }] }
  }
  return null
}
