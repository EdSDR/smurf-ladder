import { useEffect, useMemo, useRef, useState } from 'react'
import { TIERS, TIER_META, formatRank, isTier, rankScore } from '#/lib/tiers'

export type Snapshot = { tier: string; rank: string | null; lp: number; wins: number; losses: number; takenAt: number }

const H = 220
const PAD = { top: 16, right: 16, bottom: 28, left: 92 }
const dateFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const fullFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * One series: rank over time, as a single continuous score (tier, division, LP).
 * Tier boundaries are the gridlines, so the y-axis reads in tiers rather than raw numbers.
 */
export function LpChart({ points }: { points: Snapshot[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  // Dates format in the viewer's timezone, so the chart renders after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted])

  const data = useMemo(() => points.map((p) => ({ ...p, score: rankScore(p.tier, p.rank, p.lp) })), [points])

  if (!mounted) return <div ref={wrap} style={{ height: H }} />

  if (data.length < 2) {
    return (
      <div ref={wrap} className="grid h-40 place-items-center rounded-md border border-dashed text-sm text-muted-foreground">
        LP history fills in as ranked games are played.
      </div>
    )
  }

  const scores = data.map((d) => d.score)
  const yMin = Math.floor(Math.min(...scores) / 400) * 400
  const yMax = Math.max(Math.ceil((Math.max(...scores) + 1) / 400) * 400, yMin + 400)
  const t0 = data[0].takenAt
  const t1 = data[data.length - 1].takenAt
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * innerW
  const y = (s: number) => PAD.top + (1 - (s - yMin) / (yMax - yMin)) * innerH

  // Iron–Diamond are 400-point bands; Master and up share one open-ended band.
  const APEX_START = 7 * 400
  const boundaries: { score: number; tier: string; mid: number; label: string }[] = []
  for (let s = yMin; s < yMax; s += 400) {
    if (s >= APEX_START) {
      boundaries.push({ score: APEX_START, tier: 'MASTER', mid: (Math.max(APEX_START, yMin) + yMax) / 2, label: 'Master+' })
      break
    }
    const tier = TIERS[s / 400]
    boundaries.push({ score: s, tier, mid: s + 200, label: TIER_META[tier].name })
  }

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.takenAt).toFixed(1)},${y(d.score).toFixed(1)}`).join('')
  const last = data[data.length - 1]
  const lastColor = isTier(last.tier) ? TIER_META[last.tier].color : 'var(--bone)'
  const h = hover !== null ? data[hover] : null

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left + PAD.left
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(data[i].takenAt) - px) < Math.abs(x(data[best].takenAt) - px)) best = i
    setHover(best)
  }

  return (
    <div ref={wrap} className="relative">
      <svg width={width} height={H} role="img" aria-label={`Rank history: from ${formatRank(data[0].tier, data[0].rank)} to ${formatRank(last.tier, last.rank)} ${last.lp} LP`}>
        {boundaries.map((b) => (
          <g key={b.score}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(b.score)} y2={y(b.score)} stroke="var(--line)" strokeWidth={1} />
            {/* Label sits in the middle of the tier's band */}
            <text
              x={PAD.left - 10}
              y={y(b.mid)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              fill={isTier(b.tier) ? TIER_META[b.tier].color : 'var(--muted-ink)'}
              style={{ fontVariationSettings: "'wdth' 112" }}
              fontWeight={700}
            >
              {b.label}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize={12} fill="var(--muted-ink)">
          {dateFmt.format(t0)}
        </text>
        <text x={width - PAD.right} y={H - 8} fontSize={12} fill="var(--muted-ink)" textAnchor="end">
          {dateFmt.format(t1)}
        </text>

        <path d={path} fill="none" stroke="var(--bone)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.takenAt)} cy={y(last.score)} r={4.5} fill={lastColor} stroke="var(--rift)" strokeWidth={2} />

        {h && (
          <g pointerEvents="none">
            <line x1={x(h.takenAt)} x2={x(h.takenAt)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted-ink)" strokeDasharray="3 3" />
            <circle cx={x(h.takenAt)} cy={y(h.score)} r={4.5} fill="var(--bone)" stroke="var(--rift)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(x(h.takenAt) + 12, width - 170),
            top: Math.max(0, y(h.score) - 64),
          }}
        >
          <div className="text-muted-foreground">{fullFmt.format(h.takenAt)}</div>
          <div className="mt-0.5 font-semibold">
            {formatRank(h.tier, h.rank)} <span className="nums">{h.lp} LP</span>
          </div>
          <div className="nums text-muted-foreground">
            {h.wins}W {h.losses}L
          </div>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="nums mt-2 w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">When</th>
              <th className="py-1 font-normal">Rank</th>
              <th className="py-1 font-normal">LP</th>
              <th className="py-1 font-normal">Record</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.takenAt} className="border-t">
                <td className="py-1">{fullFmt.format(d.takenAt)}</td>
                <td className="py-1">{formatRank(d.tier, d.rank)}</td>
                <td className="py-1">{d.lp}</td>
                <td className="py-1">
                  {d.wins}W {d.losses}L
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
