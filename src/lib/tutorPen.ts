import type { GraphInfo, BoundsRect } from './inkRecognition'
import type { TutorGraphSpec } from './mathHint'

export interface PenStroke {
  id: string
  points: { x: number; y: number }[]
  color: string
  width: number
  dashed?: boolean
}

export interface PenLabel {
  id: string
  x: number
  y: number
  text: string
  color: string
  size: number
}

export type PenOp = { kind: 'stroke'; stroke: PenStroke } | { kind: 'label'; label: PenLabel }

const COLORS: Record<string, string> = {
  blue: '#2563eb',
  red: '#dc2626',
  green: '#059669',
  purple: '#7c3aed',
  gray: '#475569',
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

function resample(points: { x: number; y: number }[], spacing = 6): { x: number; y: number }[] {
  if (points.length < 2) return points.map((p) => ({ ...p }))
  const out = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const distance = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(distance / spacing))
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function pathLength(points: { x: number; y: number }[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return length
}

function makeStroke(
  id: string,
  points: { x: number; y: number }[],
  color: string,
  width: number,
  dashed = false
): PenOp {
  return { kind: 'stroke', stroke: { id, points, color, width, ...(dashed ? { dashed: true } : {}) } }
}

function makeLabel(id: string, x: number, y: number, text: string, color: string, size: number): PenOp {
  return { kind: 'label', label: { id, x, y, text, color, size } }
}

function dotPoints(x: number, y: number, radius: number): { x: number; y: number }[] {
  return Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius }
  })
}

export function specToPenOps(spec: TutorGraphSpec, box: { x: number; y: number; w: number; h: number }): PenOp[] {
  const ops: PenOp[] = []
  let strokeIndex = 0
  let labelIndex = 0
  const stroke = (points: { x: number; y: number }[], color: string, width: number, dashed = false) => {
    ops.push(makeStroke(`spec-stroke-${strokeIndex++}`, points, color, width, dashed))
  }
  const label = (x: number, y: number, text: string, color: string, size: number) => {
    if (text) ops.push(makeLabel(`spec-label-${labelIndex++}`, x, y, text, color, size))
  }

  const plotLeft = box.x + (52 / 316) * box.w
  const plotRight = box.x + (290 / 316) * box.w
  const plotTop = box.y + (24 / 246) * box.h
  const plotBottom = box.y + (202 / 246) * box.h
  const axisTop = box.y + (18 / 246) * box.h
  const axisRight = box.x + (302 / 316) * box.w
  const px = (x: number) => box.x + ((52 + clamp(x) * 238) / 316) * box.w
  const py = (y: number) => box.y + ((24 + (1 - clamp(y)) * 178) / 246) * box.h

  stroke(
    [
      { x: plotLeft, y: axisTop },
      { x: plotLeft, y: plotBottom },
      { x: axisRight, y: plotBottom },
    ],
    '#334155',
    3
  )
  label(box.x + (4 / 316) * box.w, box.y + (14 / 246) * box.h, spec.yLabel, '#334155', 14)
  label(axisRight, box.y + (242 / 246) * box.h, spec.xLabel, '#334155', 14)

  for (const area of spec.areas ?? []) {
    const points = area.pts.map(([x, y]) => ({ x: px(x), y: py(y) }))
    if (points.length > 2) {
      stroke(resample([...points, points[0]]), '#f59e0b', 2)
      if (area.label) {
        const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 })
        label(center.x + 16, center.y + 3, area.label, '#92400e', 13)
      }
    }
  }

  for (const line of spec.lines) {
    const points = resample(line.pts.map(([x, y]) => ({ x: px(x), y: py(y) })))
    if (points.length) {
      const color = COLORS[line.color] ?? COLORS.gray
      stroke(points, color, 3, line.dashed)
      const end = points[points.length - 1]
      label(end.x + 6, end.y + 4, line.label, color, 14)
    }
  }

  for (const guide of spec.guides ?? []) {
    const x = px(guide.x)
    const y = py(guide.y)
    stroke([{ x, y }, { x, y: plotBottom }], '#64748b', 2, true)
    stroke([{ x, y }, { x: plotLeft, y }], '#64748b', 2, true)
    stroke(dotPoints(x, y, 3.4), '#0f172a', 2)
    if (guide.xText) label(x - 4, plotBottom + 18, guide.xText, '#475569', 12)
    if (guide.yText) label(plotLeft - 24, y + 4, guide.yText, '#475569', 12)
  }

  for (const point of spec.points ?? []) {
    const x = px(point.x)
    const y = py(point.y)
    stroke(dotPoints(x, y, 3.4), '#0f172a', 2)
    label(x + (point.x > 0.75 ? -28 : 6), y - 6, point.text, '#0f172a', 12)
  }

  for (const tick of spec.ticks ?? []) {
    if (tick.axis === 'x') label(px(tick.at), plotBottom + 18, tick.text, '#475569', 12)
    else label(plotLeft - 24, py(tick.at) + 4, tick.text, '#475569', 12)
  }

  label(plotLeft, box.y + 14, spec.title, '#0f172a', 17)
  if (spec.caption) label(box.x, box.y + box.h + 18, spec.caption, '#475569', 12)
  return ops
}

export function circleOps(box: BoundsRect, note?: string): PenOp[] {
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const rx = Math.max(18, (box.maxX - box.minX) / 2 + 16)
  const ry = Math.max(18, (box.maxY - box.minY) / 2 + 16)
  const turns = 1.1
  const points = Array.from({ length: 67 }, (_, i) => {
    const angle = -Math.PI / 2 + (i / 66) * Math.PI * 2 * turns
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  })
  const ops = [makeStroke('circle-stroke-0', points, '#dc2626', 3.5)]
  const text = note?.trim().slice(0, 40)
  if (text) ops.push(makeLabel('circle-label-0', cx + rx + 8, cy, text, '#dc2626', 13))
  return ops
}

export function correctionOps(graph: GraphInfo): PenOp[] {
  if (graph.status !== 'mistake') return []
  const ops = graph.errorBox ? circleOps(graph.errorBox, graph.mistake) : []
  let strokeIndex = 0
  let labelIndex = 0
  for (const line of graph.correction?.lines ?? []) {
    const points = resample(line.pts)
    if (points.length) {
      ops.push(makeStroke(`correction-stroke-${strokeIndex++}`, points, '#059669', 3))
      const end = points[points.length - 1]
      if (line.label) ops.push(makeLabel(`correction-label-${labelIndex++}`, end.x + 8, end.y, line.label, '#059669', 14))
    }
  }
  for (const item of graph.correction?.labels ?? []) {
    ops.push(makeLabel(`correction-label-${labelIndex++}`, item.x, item.y, item.text, '#059669', 14))
  }
  return ops
}
