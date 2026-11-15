import { useCallback, useEffect, useRef, useState } from 'react'
import type { PenLabel, PenOp, PenStroke } from './tutorPen'

type Point = { x: number; y: number }
type TrailPoint = Point & { at: number }
type Cursor = Point & { visible: boolean; drawing: boolean; trail?: TrailPoint[] }
type ActiveOperation = {
  op: PenOp
  phase: 'glide' | 'draw' | 'type'
  start: number
  duration: number
  from: Point | null
  target: Point
  length: number
}

function lengthOf(points: Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return length
}

function pointsAtDistance(points: Point[], distance: number): Point[] {
  if (points.length < 2) return points.map((p) => ({ ...p }))
  const out = [{ ...points[0] }]
  let remaining = distance
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const segment = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining >= segment) {
      out.push({ ...b })
      remaining -= segment
      continue
    }
    if (remaining > 0) {
      const t = remaining / segment
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    break
  }
  return out
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function useTutorPen() {
  const [strokes, setStrokes] = useState<PenStroke[]>([])
  const [labels, setLabels] = useState<PenLabel[]>([])
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [busy, setBusy] = useState(false)
  const queueRef = useRef<PenOp[]>([])
  const activeRef = useRef<ActiveOperation | null>(null)
  const strokeRef = useRef<PenStroke[]>([])
  const labelRef = useRef<PenLabel[]>([])
  const cursorRef = useRef<Point | null>(null)
  const cursorTrailRef = useRef<TrailPoint[]>([])
  const cursorTrailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<number | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const updateCursor = useCallback((point: Point, drawing: boolean) => {
    const now = performance.now()
    if (reducedMotion()) {
      cursorTrailRef.current = []
    } else {
      const last = cursorTrailRef.current[cursorTrailRef.current.length - 1]
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 2) {
        cursorTrailRef.current = [...cursorTrailRef.current, { ...point, at: now }]
          .filter((sample) => now - sample.at <= 250)
          .slice(-8)
      }
    }
    setCursor({ ...point, visible: true, drawing, trail: [...cursorTrailRef.current] })
    if (cursorTrailTimerRef.current) clearTimeout(cursorTrailTimerRef.current)
    cursorTrailTimerRef.current = setTimeout(() => {
      cursorTrailTimerRef.current = null
      cursorTrailRef.current = []
      setCursor((current) => (current ? { ...current, trail: [] } : null))
    }, 250)
  }, [])

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      setCursor((current) => (current ? { ...current, visible: false, drawing: false } : null))
    }, 1500)
  }, [])

  const enqueue = useCallback(
    (ops: PenOp[]): string[] => {
      if (ops.length === 0) return []
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      const uniqueOps = ops.map((op) => {
        const id = `adam-${idRef.current++}`
        return op.kind === 'stroke'
          ? { kind: 'stroke' as const, stroke: { ...op.stroke, id, points: op.stroke.points.map((p) => ({ ...p })) } }
          : { kind: 'label' as const, label: { ...op.label, id } }
      })
      const ids = uniqueOps.map((op) => (op.kind === 'stroke' ? op.stroke.id : op.label.id))
      if (reducedMotion()) {
        const newStrokes = uniqueOps.filter((op): op is Extract<PenOp, { kind: 'stroke' }> => op.kind === 'stroke').map((op) => op.stroke)
        const newLabels = uniqueOps.filter((op): op is Extract<PenOp, { kind: 'label' }> => op.kind === 'label').map((op) => op.label)
        strokeRef.current = [...strokeRef.current, ...newStrokes]
        labelRef.current = [...labelRef.current, ...newLabels]
        setStrokes(strokeRef.current)
        setLabels(labelRef.current)
        const last = uniqueOps[uniqueOps.length - 1]
        const target =
          last.kind === 'stroke'
            ? last.stroke.points[last.stroke.points.length - 1]
            : { x: last.label.x, y: last.label.y }
        if (target) {
          cursorRef.current = target
          updateCursor(target, false)
        }
        setBusy(false)
        scheduleHide()
        return ids
      }
      queueRef.current.push(...uniqueOps)
      setBusy(true)

      const tick = (now: number) => {
        frameRef.current = null
        if (!activeRef.current) {
          const op = queueRef.current.shift()
          if (!op) {
            setBusy(false)
            scheduleHide()
            return
          }
          const target = op.kind === 'stroke' ? op.stroke.points[0] : { x: op.label.x, y: op.label.y }
          if (!target) {
            frameRef.current = requestAnimationFrame(tick)
            return
          }
          const from = cursorRef.current
          const glide = from && Math.hypot(target.x - from.x, target.y - from.y) > 1
          if (glide) {
            activeRef.current = { op, phase: 'glide', start: now, duration: 220, from, target, length: 0 }
            updateCursor(from, false)
          } else {
            const length = op.kind === 'stroke' ? lengthOf(op.stroke.points) : 0
            activeRef.current = {
              op,
              phase: op.kind === 'stroke' ? 'draw' : 'type',
              start: now,
              duration: op.kind === 'stroke' ? Math.max(250, (length / 700) * 1000) : Math.max(70, op.label.text.length * 70),
              from: null,
              target,
              length,
            }
            cursorRef.current = target
            updateCursor(target, op.kind === 'stroke')
          }
        }

        const active = activeRef.current
        if (!active) return
        const progress = Math.max(0, Math.min(1, (now - active.start) / active.duration))
        if (active.phase === 'glide') {
          const ease = 1 - (1 - progress) ** 3
          const from = active.from!
          const position = {
            x: from.x + (active.target.x - from.x) * ease,
            y: from.y + (active.target.y - from.y) * ease,
          }
          cursorRef.current = position
          updateCursor(position, false)
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(tick)
            return
          }
          const length = active.op.kind === 'stroke' ? lengthOf(active.op.stroke.points) : 0
          activeRef.current = {
            ...active,
            phase: active.op.kind === 'stroke' ? 'draw' : 'type',
            start: now,
            duration:
              active.op.kind === 'stroke'
                ? Math.max(250, (length / 700) * 1000)
                : Math.max(70, active.op.label.text.length * 70),
            length,
          }
          updateCursor(active.target, active.op.kind === 'stroke')
          frameRef.current = requestAnimationFrame(tick)
          return
        }

        if (active.phase === 'draw' && active.op.kind === 'stroke') {
          const partial = pointsAtDistance(active.op.stroke.points, active.length * progress)
          setStrokes([...strokeRef.current, { ...active.op.stroke, points: partial }])
          cursorRef.current = partial[partial.length - 1] ?? active.target
          updateCursor(cursorRef.current, true)
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(tick)
            return
          }
          strokeRef.current = [...strokeRef.current, active.op.stroke]
          setStrokes(strokeRef.current)
          cursorRef.current = active.target
          updateCursor(active.target, false)
        } else if (active.phase === 'type' && active.op.kind === 'label') {
          const revealed = Math.min(active.op.label.text.length, Math.floor((now - active.start) / 70))
          setLabels([...labelRef.current, { ...active.op.label, text: active.op.label.text.slice(0, revealed) }])
          cursorRef.current = active.target
          setCursor({ ...active.target, visible: true, drawing: false })
          if (progress < 1) {
            frameRef.current = requestAnimationFrame(tick)
            return
          }
          labelRef.current = [...labelRef.current, active.op.label]
          setLabels(labelRef.current)
        }

        activeRef.current = null
        frameRef.current = requestAnimationFrame(tick)
      }

      if (frameRef.current === null) frameRef.current = requestAnimationFrame(tick)
      return ids
    },
    [scheduleHide, updateCursor]
  )

  const remove = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const removing = new Set(ids)
    const operationId = (op: PenOp) => (op.kind === 'stroke' ? op.stroke.id : op.label.id)
    queueRef.current = queueRef.current.filter((op) => !removing.has(operationId(op)))
    if (activeRef.current && removing.has(operationId(activeRef.current.op))) {
      activeRef.current = null
    }
    strokeRef.current = strokeRef.current.filter((stroke) => !removing.has(stroke.id))
    labelRef.current = labelRef.current.filter((label) => !removing.has(label.id))
    setStrokes((current) => current.filter((stroke) => !removing.has(stroke.id)))
    setLabels((current) => current.filter((label) => !removing.has(label.id)))
  }, [])

  const hideCursor = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
    setCursor((current) => (current ? { ...current, visible: false, drawing: false } : null))
  }, [])

  const moveCursor = useCallback((point: Point) => {
    cursorRef.current = point
    updateCursor(point, false)
  }, [updateCursor])

  const clear = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (cursorTrailTimerRef.current) clearTimeout(cursorTrailTimerRef.current)
    frameRef.current = null
    hideTimerRef.current = null
    cursorTrailTimerRef.current = null
    queueRef.current = []
    activeRef.current = null
    strokeRef.current = []
    labelRef.current = []
    cursorRef.current = null
    cursorTrailRef.current = []
    setStrokes([])
    setLabels([])
    setCursor(null)
    setBusy(false)
  }, [])

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (cursorTrailTimerRef.current) clearTimeout(cursorTrailTimerRef.current)
    },
    []
  )

  return { strokes, labels, cursor, enqueue, remove, hideCursor, moveCursor, clear, busy }
}
