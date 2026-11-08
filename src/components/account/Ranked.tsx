import { useState } from 'react'
import { DecayText } from '#/components/DecayText'
import { ChampIcon, LpChange, TierCrest } from '#/components/game/GameArt'
import { useChampion } from '#/components/game/StaticDataProvider'
import type { MemberAccount, QueueRank } from '#/server/accounts.functions'
import { APEX, TIER_META, formatRank, isTier, winrate } from '#/lib/tiers'
import { kda, type ChampStat } from '#/lib/matchStats'
import { cn } from '#/lib/utils'

export function Panel({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[10px] border bg-panel', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** One ranked queue: crest, LP with progress to the next division, win rate, LP gains, decay. */
export function RankedCard({ label, queue, q, lp, refreshedAt }: { label: string; queue: 'solo' | 'flex'; q: QueueRank | null; lp: MemberAccount['lp']['solo']; refreshedAt: number }) {
  const [showPeak, setShowPeak] = useState(false)
  const peak = lp?.peak
  const shown = showPeak && peak ? { tier: peak.tier, rank: peak.rank, lp: peak.lp } : q
  const color = isTier(shown?.tier) ? TIER_META[shown!.tier as keyof typeof TIER_META].color : 'var(--muted-ink)'
  const wr = q ? winrate(q.wins, q.losses) : null
  const apex = shown && APEX.has(shown.tier)

  return (
    <Panel
      title={label}
      action={
        peak && q ? (
          <button
            type="button"
            onClick={() => setShowPeak((s) => !s)}
            aria-pressed={showPeak}
            className={cn('rounded-md border px-2 py-0.5 text-xs transition-colors', showPeak ? 'bg-bone text-rift' : 'text-muted-foreground hover:text-foreground')}
          >
            {showPeak ? 'Showing peak' : 'Show peak'}
          </button>
        ) : null
      }
    >
      {shown ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <TierCrest tier={shown.tier} className="size-14" />
            <div className="min-w-0 flex-1">
              <div className="wide text-xl leading-tight font-extrabold" style={{ color }}>
                {formatRank(shown.tier, shown.rank)}
              </div>
              <div className="nums text-sm text-muted-foreground">
                {shown.lp} LP{showPeak && peak ? ` on ${new Date(peak.at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}
              </div>
            </div>
          </div>
          {!apex && (
            <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${shown.lp} of 100 LP to the next division`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, shown.lp)}%`, background: color }} />
            </div>
          )}
          {q && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                <span className="nums font-semibold">{wr}%</span> <span className="text-muted-foreground">win rate</span>
              </span>
              <span className="nums text-muted-foreground">
                {q.wins}W {q.losses}L
              </span>
            </div>
          )}
          {lp && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                7 days <LpChange value={lp.d7} />
              </span>
              <span className="flex items-center gap-1.5">
                30 days <LpChange value={lp.d30} />
              </span>
            </div>
          )}
          <DecayText q={q} queue={queue} refreshedAt={refreshedAt} peakTier={peak?.tier} detailed className="text-sm" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not placed in {label} this season.</p>
      )}
    </Panel>
  )
}

function ChampName({ id }: { id: number }) {
  return <>{useChampion(id).name}</>
}

const kdaColor = (v: number) => (v >= 4 ? 'var(--mvp)' : v >= 3 ? 'var(--win)' : undefined)

export function MostPlayed({ stats, limit = 5 }: { stats: ChampStat[]; limit?: number }) {
  if (!stats.length) return <p className="text-sm text-muted-foreground">Champions show up once ranked games are loaded.</p>
  return (
    <ul className="grid gap-1">
      {stats.slice(0, limit).map((c) => {
        const k = kda(c.kills, c.deaths, c.assists)
        const wr = Math.round((c.wins / c.games) * 100)
        return (
          <li key={c.champion} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel-raised">
            <ChampIcon id={c.champion} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                <ChampName id={c.champion} />
              </div>
              <div className="nums text-xs text-muted-foreground">{(c.cs / Math.max(1, c.minutes)).toFixed(1)} CS/min</div>
            </div>
            <div className="nums text-right text-xs">
              <div className="font-semibold" style={{ color: kdaColor(k) }}>
                {k.toFixed(2)} KDA
              </div>
              <div className="text-muted-foreground">
                {(c.kills / c.games).toFixed(1)} / {(c.deaths / c.games).toFixed(1)} / {(c.assists / c.games).toFixed(1)}
              </div>
            </div>
            <div className="nums w-16 text-right text-xs">
              <div className="font-semibold" style={{ color: wr >= 60 ? 'var(--mvp)' : undefined }}>
                {wr}% WR
              </div>
              <div className="text-muted-foreground">
                {c.games} {c.games === 1 ? 'game' : 'games'}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

type SortKey = 'games' | 'wr' | 'kda' | 'score' | 'cs'

export function ChampionTable({ stats }: { stats: ChampStat[] }) {
  const [sort, setSort] = useState<SortKey>('games')
  const value = (c: ChampStat, k: SortKey) =>
    k === 'games' ? c.games : k === 'wr' ? c.wins / c.games : k === 'kda' ? kda(c.kills, c.deaths, c.assists) : k === 'score' ? (c.scored ? c.scoreSum / c.scored : 0) : c.cs / Math.max(1, c.minutes)
  const rows = [...stats].sort((a, b) => value(b, sort) - value(a, sort))
  const th = (k: SortKey, label: string) => (
    <th className="px-2 py-2 text-right font-normal">
      <button type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={cn('hover:text-foreground', sort === k && 'font-semibold text-foreground')}>
        {label}
      </button>
    </th>
  )
  if (!stats.length) return <p className="text-sm text-muted-foreground">No champion stats yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="nums w-full min-w-[560px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-2 py-2 text-left font-normal">Champion</th>
            {th('games', 'Games')}
            {th('wr', 'Win rate')}
            {th('kda', 'KDA')}
            {th('cs', 'CS/min')}
            {th('score', 'Avg score')}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const k = kda(c.kills, c.deaths, c.assists)
            return (
              <tr key={c.champion} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <ChampIcon id={c.champion} size={28} />
                    <ChampName id={c.champion} />
                  </span>
                </td>
                <td className="px-2 text-right">{c.games}</td>
                <td className="px-2 text-right">{Math.round((c.wins / c.games) * 100)}%</td>
                <td className="px-2 text-right" style={{ color: kdaColor(k) }}>
                  {k.toFixed(2)}
                </td>
                <td className="px-2 text-right">{(c.cs / Math.max(1, c.minutes)).toFixed(1)}</td>
                <td className="px-2 text-right">{c.scored ? (c.scoreSum / c.scored).toFixed(1) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
