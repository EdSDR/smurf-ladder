import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChampIcon, LpChange, RoleIcon } from '#/components/game/GameArt'
import { ChartContainer, ChartTooltip, type ChartConfig } from '#/components/ui/chart'
import { champIconUrl, ROLE_NAMES, ROLES } from '#/lib/assets'
import { kda, type ChampStat, type Summary } from '#/lib/matchStats'
import { placementLabel } from '#/lib/score'
import { TIERS, TIER_META, formatRank, rankScore } from '#/lib/tiers'

export type ChartGame = { matchId: string; win: boolean; championId: number; score: number | null; placement: number | null; badge: 'MVP' | 'ACE' | null; endedAt: number }

function Stat({ value, label, accent }: { value: React.ReactNode; label: string; accent?: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="wide nums text-2xl leading-none font-extrabold sm:text-[2rem]" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

const scoreConfig = { score: { label: 'Game score' } } satisfies ChartConfig

/** One bar per game (oldest → newest), colored by result, with champion and placement underneath. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

function ScoreChart({ games }: { games: ChartGame[] }) {
  // Phones get the last 10 games so champion icons stay legible.
  const narrow = useNarrow()
  const data = [...games.slice(0, narrow ? 10 : 20)].reverse().map((g, i) => ({ ...g, i, value: g.score ?? 0 }))
  const Tick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: number } }) => {
    const g = data[payload?.value ?? 0]
    if (!g || x === undefined || y === undefined) return null
    const color = g.badge === 'MVP' ? 'var(--mvp)' : g.badge === 'ACE' ? 'var(--ace)' : 'var(--muted-ink)'
    return (
      <g transform={`translate(${x},${y})`}>
        <clipPath id={`clip-${g.matchId}`}>
          <circle cx={0} cy={13} r={10} />
        </clipPath>
        <image href={champIconUrl(g.championId)} x={-10} y={3} width={20} height={20} clipPath={`url(#clip-${g.matchId})`} />
        <circle cx={0} cy={13} r={10.5} fill="none" stroke={g.win ? 'var(--win)' : 'var(--loss)'} strokeWidth={1.5} />
        <text x={0} y={38} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
          {g.placement ? placementLabel(g.placement, g.badge) : 'Rmk'}
        </text>
      </g>
    )
  }
  return (
    <ChartContainer config={scoreConfig} className="aspect-auto h-52 w-full">
      <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--line)" />
        <YAxis domain={[0, 10]} ticks={[0, 5, 10]} width={22} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-ink)', fontSize: 11 }} />
        <XAxis dataKey="i" tickLine={false} axisLine={false} interval={0} height={46} tick={<Tick />} />
        <ReferenceLine y={5} stroke="var(--muted-ink)" strokeDasharray="2 4" strokeOpacity={0.6} />
        <ChartTooltip
          cursor={{ fill: 'var(--panel-raised)' }}
          content={({ active, payload }) => {
            const g = active && payload?.[0]?.payload
            if (!g) return null
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
                <div className="font-semibold">{g.win ? 'Victory' : 'Defeat'}</div>
                <div className="nums">Score {g.score ?? '–'}</div>
                <div className="text-muted-foreground">{new Date(g.endedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
              </div>
            )
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={22}>
          <LabelList dataKey="value" position="top" fontSize={10} fill="var(--bone)" formatter={(v: unknown) => (typeof v === 'number' && v ? v.toFixed(1) : '')} />
          {data.map((g) => (
            <Cell key={g.matchId} fill={g.win ? 'var(--win)' : 'var(--loss)'} fillOpacity={g.score === null ? 0.25 : 0.85} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** TrackDiff's "Match performance" panel: last-20 averages, top champions, roles, score bars. */
export function MatchPerformance({ summary, games, champStats, label = 'Last 20 games' }: { summary: Summary | null; games: ChartGame[]; champStats: ChampStat[]; label?: string }) {
  if (!summary || summary.games === 0) {
    return <p className="text-sm text-muted-foreground">No ranked games loaded yet. They appear after the next refresh.</p>
  }
  const wr = Math.round((summary.wins / summary.games) * 100)
  const avgScore = summary.scored ? summary.scoreSum / summary.scored : null
  const roleTotal = Object.values(summary.roles).reduce((a, b) => a + b, 0)
  const roleMax = Math.max(1, ...Object.values(summary.roles))
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Stat value={avgScore !== null ? avgScore.toFixed(1) : '–'} label="Avg. score" />
        <Stat value={kda(summary.kills, summary.deaths, summary.assists).toFixed(2)} label="Avg. KDA" />
        <Stat value={(summary.cs / Math.max(1, summary.minutes)).toFixed(1)} label="CS per minute" accent="var(--mvp)" />
        <Stat value={`${wr}%`} label={`${summary.wins}W ${summary.games - summary.wins}L`} />
        <div className="grid gap-0.5">
          <LpChange value={summary.lp} className="w-fit text-sm" />
          <span className="text-xs text-muted-foreground">LP over {label.toLowerCase()}</span>
        </div>
        {roleTotal > 0 && (
          <div className="ml-auto flex items-end gap-2" aria-label="Games per role">
            {ROLES.map((r) => {
              const n = summary.roles[r] ?? 0
              return (
                <div key={r} className="flex flex-col items-center gap-1" title={`${ROLE_NAMES[r]}: ${n}`}>
                  <span className="nums text-[11px] text-muted-foreground">{n}</span>
                  <span className="w-3 rounded-t-sm bg-bone/80" style={{ height: `${4 + (n / roleMax) * 34}px`, opacity: n ? 1 : 0.2 }} />
                  <RoleIcon position={r} className="size-4" />
                </div>
              )
            })}
          </div>
        )}
      </div>
      {champStats.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {champStats.slice(0, 5).map((c) => (
            <div key={c.champion} className="flex items-center gap-2 text-xs">
              <ChampIcon id={c.champion} size={28} />
              <span className="nums leading-tight">
                <span className="block font-semibold">{Math.round((c.wins / c.games) * 100)}% WR</span>
                <span className="text-muted-foreground">{kda(c.kills, c.deaths, c.assists).toFixed(2)} KDA</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {games.length > 0 && <ScoreChart games={games} />}
      <p className="text-xs text-muted-foreground">
        Score is our own estimate (0–10), comparing each player with the other nine in the game. MVP is the best on the winning team; ACE the best on the losing team.
      </p>
    </div>
  )
}

const lpConfig = { score: { label: 'Rank', color: 'var(--bone)' } } satisfies ChartConfig
type Snap = { tier: string; rank: string | null; lp: number; wins: number; losses: number; takenAt: number }

/** Rank over time as one continuous score, with tier boundaries as the only gridlines. */
export function LpHistoryChart({ points }: { points: Snap[] }) {
  if (points.length < 2) return <p className="text-sm text-muted-foreground">LP history fills in as ranked games are played.</p>
  const data = points.map((p) => ({ ...p, score: rankScore(p.tier, p.rank, p.lp) }))
  const lo = Math.floor(Math.min(...data.map((d) => d.score)) / 400) * 400
  const hi = Math.max(Math.ceil((Math.max(...data.map((d) => d.score)) + 1) / 400) * 400, lo + 400)
  const ticks: number[] = []
  for (let s = lo; s <= Math.min(hi, 7 * 400); s += 400) ticks.push(s)
  const tierAt = (s: number) => (s >= 7 * 400 ? 'Master+' : TIER_META[TIERS[s / 400]].name)
  return (
    <ChartContainer config={lpConfig} className="aspect-auto h-48 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="lpFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--bone)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--bone)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <YAxis domain={[lo, hi]} ticks={ticks} tickFormatter={tierAt} width={70} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-ink)', fontSize: 11 }} />
        <XAxis
          dataKey="takenAt"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t: number) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tick={{ fill: 'var(--muted-ink)', fontSize: 11 }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            const p = active && (payload?.[0]?.payload as (typeof data)[number] | undefined)
            if (!p) return null
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
                <div className="font-semibold">
                  {formatRank(p.tier, p.rank)} <span className="nums">{p.lp} LP</span>
                </div>
                <div className="nums text-muted-foreground">
                  {p.wins}W {p.losses}L, {new Date(p.takenAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            )
          }}
        />
        <Area dataKey="score" type="monotone" stroke="var(--bone)" strokeWidth={2} fill="url(#lpFill)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  )
}
