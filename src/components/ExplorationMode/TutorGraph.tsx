import { memo } from 'react'
import type { TutorGraphSpec } from '../../lib/mathHint'

/**
 * A graph the tutor draws inside its reply (see server/graphDraw.js for where
 * the description comes from). Curves are drawn in one after another, the way
 * a teacher would sketch them, then the labels and guide lines appear.
 */

const W = 316
const H = 246
const M = { left: 52, right: 26, top: 24, bottom: 44 }
const PW = W - M.left - M.right
const PH = H - M.top - M.bottom

const COLORS: Record<string, string> = {
  blue: '#2563eb',
  red: '#dc2626',
  green: '#059669',
  purple: '#7c3aed',
  gray: '#475569',
}

const px = (x: number) => M.left + Math.max(0, Math.min(1, x)) * PW
const py = (y: number) => M.top + (1 - Math.max(0, Math.min(1, y))) * PH

/** Push labels that would overlap apart, keeping their order. */
function spread(values: number[], gap: number, lo: number, hi: number): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  for (let k = 1; k < order.length; k++) {
    if (order[k].v - order[k - 1].v < gap) order[k].v = order[k - 1].v + gap
  }
  const overflow = order.length ? order[order.length - 1].v - hi : 0
  if (overflow > 0) for (const o of order) o.v = Math.max(lo, o.v - overflow)
  const out = [...values]
  for (const o of order) out[o.i] = o.v
  return out
}

function TutorGraphImpl({ spec }: { spec: TutorGraphSpec }) {
  const guides = spec.guides ?? []
  const ticks = spec.ticks ?? []
  const lineDelay = (i: number) => 0.15 + i * 0.45
  const afterLines = lineDelay(spec.lines.length) + 0.1

  // Labels along the left axis (prices) and under the bottom axis (quantities).
  const yItems = [
    ...guides.filter((g) => g.yText).map((g) => ({ at: py(g.y), text: g.yText as string, strong: true })),
    ...ticks.filter((t) => t.axis === 'y').map((t) => ({ at: py(t.at), text: t.text, strong: false })),
  ]
  const yPos = spread(yItems.map((t) => t.at), 12, M.top + 4, M.top + PH - 2)
  const xItems = [
    ...guides.filter((g) => g.xText).map((g) => ({ at: px(g.x), text: g.xText as string, strong: true })),
    ...ticks.filter((t) => t.axis === 'x').map((t) => ({ at: px(t.at), text: t.text, strong: false })),
  ].sort((a, b) => a.at - b.at)
  // Neighbours that would collide drop to a second row.
  const xRow: number[] = []
  xItems.forEach((item, i) => {
    const prev = xItems[i - 1]
    const close = prev && item.at - prev.at < (prev.text.length + item.text.length) * 3.1 + 6
    xRow.push(close && xRow[i - 1] === 0 ? 1 : 0)
  })

  return (
    <figure className="tutor-graph" aria-label={`Graph: ${spec.title}`}>
      <figcaption className="tutor-graph-title">{spec.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {(spec.areas ?? []).map((a, i) => {
          const cx = a.pts.reduce((s, p) => s + px(p[0]), 0) / a.pts.length
          const cy = a.pts.reduce((s, p) => s + py(p[1]), 0) / a.pts.length
          return (
            <g key={`a${i}`} className="tutor-graph-fade" style={{ animationDelay: `${afterLines + 0.2}s` }}>
              <polygon points={a.pts.map((p) => `${px(p[0])},${py(p[1])}`).join(' ')} fill="#f59e0b" fillOpacity={0.32} />
              {a.label && (
                <text x={cx + 16} y={cy + 3} className="tutor-graph-small" fill="#92400e">
                  {a.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Axes */}
        <path
          d={`M ${M.left} ${M.top - 6} L ${M.left} ${M.top + PH} L ${M.left + PW + 12} ${M.top + PH}`}
          className="tutor-graph-axis tutor-graph-draw"
          pathLength={1}
        />
        <text x={4} y={11} textAnchor="start" className="tutor-graph-axis-label">
          {spec.yLabel}
        </text>
        <text x={M.left + PW + 12} y={H - 4} textAnchor="end" className="tutor-graph-axis-label">
          {spec.xLabel}
        </text>

        {/* Guide lines to the axes */}
        {guides.map((g, i) => (
          <g key={`g${i}`} className="tutor-graph-fade" style={{ animationDelay: `${afterLines}s` }}>
            {g.yText && <line x1={M.left} y1={py(g.y)} x2={px(g.x)} y2={py(g.y)} className="tutor-graph-guide" />}
            {g.xText && <line x1={px(g.x)} y1={py(g.y)} x2={px(g.x)} y2={M.top + PH} className="tutor-graph-guide" />}
            <circle cx={px(g.x)} cy={py(g.y)} r={3.4} fill="#0f172a" />
          </g>
        ))}

        {/* Curves */}
        {spec.lines.map((l, i) => {
          const color = COLORS[l.color] ?? COLORS.gray
          const d = l.pts.map((p, k) => `${k ? 'L' : 'M'} ${px(p[0])} ${py(p[1])}`).join(' ')
          const last = l.pts[l.pts.length - 1]
          // Short names sit just past the end of the curve. Dashed lines and long
          // names would run into a neighbour or off the edge, so they sit beside
          // the end instead: above it, or below when the curve ends low.
          const ex = px(last[0])
          const ey = py(last[1])
          const tucked = l.dashed || l.label.length > 3
          const labelPlace = tucked
            ? { x: ex - 4, y: !l.dashed && last[1] < 0.5 ? ey + 15 : ey - 8, textAnchor: 'end' as const }
            : { x: ex + 6, y: last[1] < 0.12 ? ey - 6 : ey + 4, textAnchor: 'start' as const }
          return (
            <g key={`l${i}`}>
              {l.dashed ? (
                <path
                  d={d}
                  stroke={color}
                  className="tutor-graph-line tutor-graph-fade"
                  strokeDasharray="6 5"
                  style={{ animationDelay: `${lineDelay(i)}s` }}
                />
              ) : (
                <path
                  d={d}
                  stroke={color}
                  pathLength={1}
                  className="tutor-graph-line tutor-graph-draw"
                  style={{ animationDelay: `${lineDelay(i)}s` }}
                />
              )}
              <text
                {...labelPlace}
                fill={color}
                className="tutor-graph-label tutor-graph-fade"
                style={{ animationDelay: `${lineDelay(i) + 0.35}s` }}
              >
                {l.label}
              </text>
            </g>
          )
        })}

        {(spec.points ?? []).map((p, i) => (
          <g key={`p${i}`} className="tutor-graph-fade" style={{ animationDelay: `${afterLines + i * 0.15}s` }}>
            <circle cx={px(p.x)} cy={py(p.y)} r={3.4} fill="#0f172a" />
            <text
              x={px(p.x) + (p.x > 0.75 ? -6 : 6)}
              y={py(p.y) - 6}
              textAnchor={p.x > 0.75 ? 'end' : 'start'}
              className="tutor-graph-small"
              fill="#0f172a"
            >
              {p.text}
            </text>
          </g>
        ))}

        {/* Axis numbers and names */}
        {yItems.map((t, i) => (
          <text
            key={`y${i}`}
            x={M.left - 6}
            y={yPos[i] + 3.5}
            textAnchor="end"
            className={`tutor-graph-small tutor-graph-fade${t.strong ? ' is-strong' : ''}`}
            style={{ animationDelay: `${afterLines}s` }}
          >
            {t.text}
          </text>
        ))}
        {xItems.map((t, i) => (
          <text
            key={`x${i}`}
            x={t.at}
            y={M.top + PH + 13 + xRow[i] * 12}
            textAnchor="middle"
            className={`tutor-graph-small tutor-graph-fade${t.strong ? ' is-strong' : ''}`}
            style={{ animationDelay: `${afterLines}s` }}
          >
            {t.text}
          </text>
        ))}
      </svg>
      {spec.caption && <p className="tutor-graph-caption">{spec.caption}</p>}
    </figure>
  )
}

export default memo(TutorGraphImpl)
