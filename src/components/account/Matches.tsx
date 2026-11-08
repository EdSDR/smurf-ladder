import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ChampIcon, ItemIcon, LpChange, PlacementBadge, RuneIcon, SpellIcon } from '#/components/game/GameArt'
import type { LiveGame } from '#/db/schema'
import type { MatchEntry } from '#/server/accounts.server'
import { QUEUE_NAMES } from '#/lib/match'
import { ago } from '#/lib/time'
import { cn } from '#/lib/utils'

const duration = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`

/** One stored game, TrackDiff-style: result rail, champion, KDA, score, items and both teams. */
export function MatchRow({ m, selfName, selfTag, tracked }: { m: MatchEntry; selfName: string; selfTag: string; tracked: Record<string, number> }) {
  const self =
    m.participants.find((p) => p.name.toLowerCase() === selfName.toLowerCase() && p.tag.toLowerCase() === selfTag.toLowerCase()) ??
    m.participants.find((p) => p.champion === m.championId && p.kills === m.kills && p.deaths === m.deaths)
  const minutes = m.durationS / 60
  const result = m.remake ? 'Remake' : m.win ? 'Victory' : 'Defeat'
  const teams = [100, 200].map((t) => m.participants.filter((p) => p.team === t))

  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-[10px] border-l-4 px-4 py-3 lg:grid-cols-[7.5rem_auto_7rem_4rem_auto_minmax(11rem,1fr)] lg:items-center',
        m.remake ? 'border-l-muted-ink bg-panel' : m.win ? 'border-l-win bg-win-tint' : 'border-l-loss bg-loss-tint',
      )}
    >
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-span-1 lg:grid lg:gap-1">
        <span className="font-semibold" style={{ color: m.remake ? 'var(--muted-ink)' : m.win ? 'var(--win)' : 'var(--loss)' }}>
          {QUEUE_NAMES[m.queue === 'solo' ? 420 : 440]}
        </span>
        <span className="text-xs text-muted-foreground">{ago(m.endedAt)}</span>
        <span className="flex items-center gap-1.5">
          <LpChange value={m.lpChange} />
          <PlacementBadge placement={m.placement} badge={m.badge} />
        </span>
        <span className="nums text-xs text-muted-foreground">
          {result}, {duration(m.durationS)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ChampIcon id={m.championId} size={48} level={self?.champLevel} />
        {self && (
          <div className="grid grid-cols-2 gap-0.5">
            <SpellIcon id={self.spells[0]} />
            <RuneIcon id={self.keystone} />
            <SpellIcon id={self.spells[1]} />
            <RuneIcon id={self.subStyle} size={16} />
          </div>
        )}
      </div>

      <div className="nums">
        <div className="wide text-lg leading-tight font-extrabold">
          {m.kills} / <span style={{ color: 'var(--drop)' }}>{m.deaths}</span> / {m.assists}
        </div>
        <div className="text-xs whitespace-nowrap text-muted-foreground">{(m.cs / minutes).toFixed(1)} CS/min</div>
        {self && <div className="text-xs whitespace-nowrap text-muted-foreground">{Math.round(self.kp * 100)}% kill share</div>}
      </div>

      <div className="nums text-center">
        <div className="wide text-xl leading-tight font-extrabold">{m.score?.toFixed(1) ?? '–'}</div>
        <div className="text-[11px] text-muted-foreground">Score</div>
      </div>

      {self ? (
        <div className="grid w-fit grid-cols-4 gap-0.5">
          {self.items.map((id, i) => (
            <ItemIcon key={i} id={id} />
          ))}
        </div>
      ) : (
        <span />
      )}

      <div className="col-span-2 hidden grid-cols-2 gap-x-3 text-xs sm:grid lg:col-span-1">
        {teams.map((team, t) => (
          <ul key={t} className="grid min-w-0 gap-0.5">
            {team.map((p, i) => {
              const id = tracked[`${p.name}#${p.tag}`.toLowerCase()]
              const isSelf = p === self
              return (
                <li key={i} className="flex min-w-0 items-center gap-1.5">
                  <ChampIcon id={p.champion} size={16} />
                  {id && !isSelf ? (
                    <Link to="/accounts/$id" params={{ id: String(id) }} className="truncate font-semibold text-foreground underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className={cn('truncate', isSelf ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{p.name || 'Unknown'}</span>
                  )}
                </li>
              )
            })}
          </ul>
        ))}
      </div>
    </li>
  )
}

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function LiveGamePanel({ game, tracked }: { game: LiveGame; tracked: Record<string, number> }) {
  const elapsed = useElapsed(game.startedAt)
  const teams = [100, 200].map((t) => game.teams.filter((p) => p.team === t))
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <ChampIcon id={game.championId} size={56} />
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="size-2 animate-pulse rounded-full bg-loss motion-reduce:animate-none" aria-hidden />
            In game: {QUEUE_NAMES[game.queueId] ?? 'Other queue'}
          </div>
          <div className="nums wide text-2xl font-extrabold">{elapsed}</div>
          <div className="text-xs text-muted-foreground">Game time is approximate; it’s refreshed every few minutes.</div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {teams.map((team, t) => (
          <div key={t} className="rounded-[10px] border bg-panel p-3">
            <div className="mb-2 text-sm font-semibold" style={{ color: t === 0 ? 'var(--win)' : 'var(--loss)' }}>
              {t === 0 ? 'Blue team' : 'Red team'}
            </div>
            <ul className="grid gap-1.5">
              {team.map((p, i) => {
                const id = tracked[p.name.toLowerCase()]
                return (
                  <li key={i} className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 text-sm', p.self && 'bg-panel-raised')}>
                    <ChampIcon id={p.champion} size={28} />
                    <span className="flex gap-0.5">
                      <SpellIcon id={p.spells[0]} size={16} />
                      <SpellIcon id={p.spells[1]} size={16} />
                    </span>
                    {id && !p.self ? (
                      <Link to="/accounts/$id" params={{ id: String(id) }} className="truncate font-semibold hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className={cn('truncate', p.self ? 'font-semibold' : 'text-muted-foreground')}>{p.name || 'Unknown player'}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
