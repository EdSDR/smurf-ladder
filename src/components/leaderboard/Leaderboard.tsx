import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'
import { CredentialDialog } from '#/components/CredentialDialog'
import { DecayText, decaysSoon } from '#/components/DecayText'
import { ChampIcon, LpChange, RankLabel, RoleIcon, TierCrest } from '#/components/game/GameArt'
import { ProfileIcon } from '#/components/TierMark'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import type { MemberAccount, PublicAccount } from '#/server/accounts.functions'
import type { Me } from '#/server/auth.functions'
import { ROLE_NAMES, ROLES } from '#/lib/assets'
import { DECAY_SOON_DAYS } from '#/lib/decay'
import { TIERS, TIER_META, isTier, rankScore, tierIndex, winrate } from '#/lib/tiers'
import { cn } from '#/lib/utils'

export type Queue = 'solo' | 'flex'
export type Row = PublicAccount & Partial<Omit<MemberAccount, keyof PublicAccount>>
const UNRANKED = 'UNRANKED'

export const leaderboardSearch = z.object({
  queue: z.enum(['solo', 'flex']).optional(),
  tiers: z.string().optional(),
  role: z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']).optional(),
  status: z.enum(['live', 'free', 'decay']).optional(),
  shared: z.boolean().optional(),
  q: z.string().optional(),
})
export type LeaderboardSearch = z.infer<typeof leaderboardSearch>

const score = (a: Row, q: Queue) => rankScore(a[q]?.tier ?? null, a[q]?.rank ?? null, a[q]?.lp ?? null)
const stepOf = (a: Row, q: Queue) => (isTier(a[q]?.tier) ? a[q]!.tier : UNRANKED)

function tierRange(accounts: Row[], queue: Queue) {
  const ranked = accounts.map((a) => a[queue]?.tier).filter(isTier)
  if (!ranked.length) return null
  const sorted = [...ranked].sort((a, b) => tierIndex(a) - tierIndex(b))
  const low = TIER_META[sorted[0]].name
  const high = TIER_META[sorted[sorted.length - 1]].name
  return low === high ? `all ${low}` : `${low} to ${high}`
}

/** What's left of the staircase: one bar per tier, height by count, click to filter. */
function TierStrip({ accounts, queue, selected, onToggle }: { accounts: Row[]; queue: Queue; selected: string[]; onToggle: (t: string) => void }) {
  const counts = new Map<string, number>()
  for (const a of accounts) counts.set(stepOf(a, queue), (counts.get(stepOf(a, queue)) ?? 0) + 1)
  const max = Math.max(1, ...counts.values())
  return (
    <ol className="flex h-full min-w-0 flex-1 items-end gap-1" aria-label="Accounts per tier">
      {[UNRANKED, ...TIERS].map((t) => {
        const n = counts.get(t) ?? 0
        const color = t === UNRANKED ? 'var(--muted-ink)' : TIER_META[t as (typeof TIERS)[number]].color
        const name = t === UNRANKED ? 'Unranked' : TIER_META[t as (typeof TIERS)[number]].name
        const active = selected.includes(t)
        return (
          <li key={t} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <button
              type="button"
              onClick={() => onToggle(t)}
              aria-pressed={active}
              aria-label={`${name}: ${n} ${n === 1 ? 'account' : 'accounts'}`}
              title={`${name}: ${n}`}
              disabled={n === 0}
              className={cn(
                'group flex w-full flex-col items-center justify-end gap-1 rounded-sm transition-opacity disabled:cursor-default',
                selected.length > 0 && !active && 'opacity-35',
              )}
              style={{ height: '100%' }}
            >
              <span className="nums text-[11px] font-semibold" style={{ color }}>
                {n || ''}
              </span>
              <span
                className="w-full rounded-t-sm transition-[filter] group-hover:brightness-125"
                style={{ height: `${n ? 12 + (n / max) * 52 : 3}px`, background: n ? color : 'var(--line)', opacity: n ? 0.85 : 1 }}
              />
              {t === UNRANKED ? (
                <span className="size-4 text-[10px] leading-4 text-muted-foreground">–</span>
              ) : (
                <TierCrest tier={t} className="size-4" />
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function SummaryStat({ label, value, onClick, active }: { label: string; value: React.ReactNode; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="wide nums text-lg leading-tight font-extrabold">{value}</span>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('grid gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-panel-raised', active && 'bg-panel-raised')}>
      {body}
    </button>
  ) : (
    <div className="grid gap-0.5 px-3 py-2">{body}</div>
  )
}

function LiveSince({ startedAt }: { startedAt: number }) {
  const min = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000))
  return <span className="nums text-xs text-muted-foreground">{min} min</span>
}

function WinrateCell({ wins, losses }: { wins: number; losses: number }) {
  const wr = winrate(wins, losses)
  if (wr === null) return <span className="text-sm text-muted-foreground">No games</span>
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="nums font-semibold">{wr}%</span>
        <span className="nums text-xs text-muted-foreground">{wins + losses} games</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-loss/70" aria-hidden>
        <div className="h-full bg-win" style={{ width: `${wr}%` }} />
      </div>
    </div>
  )
}

const COLS_MEMBER = 'md:grid-cols-[2.25rem_1.75rem_minmax(0,1.7fr)_minmax(10.5rem,1.25fr)_4.75rem_minmax(7rem,1fr)_5rem_minmax(0,1.2fr)_4.5rem]'
const COLS_PUBLIC = 'md:grid-cols-[2.25rem_minmax(0,2fr)_minmax(10.5rem,1.4fr)_minmax(7rem,1fr)]'

function LeaderRow({ a, place, queue, meId }: { a: Row; place: number; queue: Queue; meId?: number }) {
  const q = a[queue]
  const member = meId !== undefined
  const riotId = `${a.gameName}#${a.tagLine}`
  const canSeeLogin = member && a.hasCredentials && (a.shared || a.ownerId === meId)
  const podium = place <= 3 && q && isTier(q.tier)
  const riot = (
    <span className="block truncate font-semibold">
      {a.gameName}
      <span className="font-normal text-muted-foreground">#{a.tagLine}</span>
    </span>
  )
  // Two separate links (account, owner): links can't nest.
  const name = (
    <span className="flex min-w-0 flex-col">
      {member ? (
        <Link to="/accounts/$id" params={{ id: String(a.id) }} className="block min-w-0 underline-offset-4 hover:underline">
          {riot}
        </Link>
      ) : (
        riot
      )}
      {member && a.ownerName && (
        <Link to="/members/$id" params={{ id: String(a.ownerId) }} className="block w-fit max-w-full truncate text-xs text-muted-foreground hover:text-foreground">
          {a.ownerName}
        </Link>
      )}
    </span>
  )

  return (
    <li
      id={`account-${a.id}`}
      className={cn(
        'grid scroll-mt-28 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[10px] border border-transparent bg-panel px-3 py-2.5 target:border-bone md:gap-x-4',
        member ? COLS_MEMBER : COLS_PUBLIC,
      )}
      style={podium ? { borderColor: `color-mix(in oklab, ${TIER_META[q.tier as (typeof TIERS)[number]].color} 55%, transparent)` } : undefined}
    >
      <span className="wide nums text-center text-lg font-extrabold text-muted-foreground" style={podium ? { color: 'var(--bone)' } : undefined}>
        {place}
      </span>
      {member && (
        <span className="hidden md:block">
          <RoleIcon position={a.mainRole ?? null} />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          <ProfileIcon iconId={a.iconId} className="size-10 rounded-full" />
          {a.inGame && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-loss px-1 text-[9px] leading-3 font-bold text-white">Live</span>
          )}
        </span>
        {name}
      </span>
      <span className="col-start-2 row-start-2 md:col-start-auto md:row-start-auto">
        <RankLabel tier={q?.tier ?? null} rank={q?.rank ?? null} lp={q?.lp} />
      </span>
      {member && (
        <span className="hidden md:block">
          <LpChange value={a.lp?.[queue]?.d1 ?? null} />
        </span>
      )}
      <span className="hidden md:block">{q ? <WinrateCell wins={q.wins} losses={q.losses} /> : <span className="text-sm text-muted-foreground">Not placed</span>}</span>
      {member && (
        <span className="hidden items-center -space-x-1.5 md:flex">
          {(a.topChamps ?? []).map((c) => (
            <ChampIcon key={c} id={c} size={26} className="ring-2 ring-panel rounded-full" />
          ))}
        </span>
      )}
      {member && (
        <span className="col-span-2 col-start-2 row-start-3 flex flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1 md:col-start-auto md:row-start-auto md:grid md:gap-1">
          {a.liveGame ? (
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <ChampIcon id={a.liveGame.championId} size={20} />
              In game <LiveSince startedAt={a.liveGame.startedAt} />
            </span>
          ) : null}
          <DecayText q={q} queue={queue} refreshedAt={a.refreshedAt} />
        </span>
      )}
      {member ? (
        <span className="col-start-3 row-span-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-span-1 md:row-start-auto">
          {canSeeLogin && <CredentialDialog accountId={a.id} riotId={riotId} />}
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/accounts/$id" params={{ id: String(a.id) }} aria-label={`Open ${riotId}`}>
              <ChevronRightIcon />
            </Link>
          </Button>
        </span>
      ) : (
        <span className="hidden" />
      )}
    </li>
  )
}

export function Leaderboard({ accounts, me, search }: { accounts: Row[]; me: Me | null; search: LeaderboardSearch }) {
  const navigate = useNavigate()
  const queue: Queue = search.queue ?? 'solo'
  const selected = search.tiers ? search.tiers.split(',') : []
  const member = !!me
  const update = (patch: Partial<LeaderboardSearch>) =>
    navigate({ to: '.', search: (prev: LeaderboardSearch) => ({ ...prev, ...patch }), replace: true, resetScroll: false })

  const ranked = useMemo(() => [...accounts].sort((x, y) => score(y, queue) - score(x, queue) || x.gameName.localeCompare(y.gameName)), [accounts, queue])
  const places = useMemo(() => new Map(ranked.map((a, i) => [a.id, i + 1])), [ranked])

  const visible = useMemo(() => {
    const needle = search.q?.trim().toLowerCase()
    return ranked.filter((a) => {
      if (selected.length && !selected.includes(stepOf(a, queue))) return false
      if (search.role && a.mainRole !== search.role) return false
      if (search.status === 'live' && !a.inGame) return false
      if (search.status === 'free' && a.inGame) return false
      if (search.status === 'decay' && !decaysSoon(a[queue], a.refreshedAt)) return false
      if (search.shared && !(a.shared && a.hasCredentials)) return false
      if (needle && !`${a.gameName}#${a.tagLine} ${a.ownerName ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [ranked, queue, selected.join(), search.role, search.status, search.shared, search.q]) // eslint-disable-line react-hooks/exhaustive-deps

  const inGame = accounts.filter((a) => a.inGame).length
  const decaying = accounts.filter((a) => decaysSoon(a[queue], a.refreshedAt)).length
  const top = ranked[0]
  const range = tierRange(accounts, queue)
  const filtering = selected.length > 0 || !!search.role || !!search.status || !!search.shared || !!search.q
  const toggleTier = (t: string) => {
    const next = selected.includes(t) ? selected.filter((s) => s !== t) : [...selected, t]
    update({ tiers: next.length ? next.join(',') : undefined })
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:pt-10">
      <header className="mb-6">
        <h1 className="wide text-2xl leading-none font-extrabold tracking-tight sm:text-hero">Leaderboard</h1>
        <p className="mt-2 text-muted-foreground">
          {accounts.length === 0
            ? 'No accounts yet.'
            : `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} on BR${range ? `, ${range}` : ''}.`}
        </p>
      </header>

      <section aria-label="Summary" className="mb-4 flex flex-col gap-3 rounded-[10px] border bg-panel p-3 sm:flex-row sm:items-stretch">
        <div className="flex h-24 min-w-0 flex-1 px-1">
          <TierStrip accounts={accounts} queue={queue} selected={selected} onToggle={toggleTier} />
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-2">
          {member && <SummaryStat label="In game now" value={inGame} onClick={() => update({ status: search.status === 'live' ? undefined : 'live' })} active={search.status === 'live'} />}
          {member && (
            <SummaryStat
              label={`Decay within ${DECAY_SOON_DAYS} days`}
              value={decaying}
              onClick={() => update({ status: search.status === 'decay' ? undefined : 'decay' })}
              active={search.status === 'decay'}
            />
          )}
          {top && top[queue] && (
            <SummaryStat
              label="Highest"
              value={
                <span className="flex items-center gap-1.5 text-base">
                  <TierCrest tier={top[queue]!.tier} className="size-5" />
                  <span className="max-w-36 truncate">{top.gameName}</span>
                </span>
              }
            />
          )}
        </div>
      </section>

      <div className="sticky top-14 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b bg-rift/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-[10px] sm:border sm:px-2.5">
        <ToggleGroup type="single" value={queue} onValueChange={(v) => v && update({ queue: v === 'solo' ? undefined : (v as Queue) })} variant="outline" size="sm" aria-label="Queue">
          <ToggleGroupItem value="solo">Solo/Duo</ToggleGroupItem>
          <ToggleGroupItem value="flex">Flex</ToggleGroupItem>
        </ToggleGroup>
        {member && (
          <ToggleGroup
            type="single"
            value={search.role ?? 'ALL'}
            onValueChange={(v) => update({ role: !v || v === 'ALL' ? undefined : (v as LeaderboardSearch['role']) })}
            variant="outline"
            size="sm"
            aria-label="Main role"
          >
            <ToggleGroupItem value="ALL" aria-label="All roles">
              All
            </ToggleGroupItem>
            {ROLES.map((r) => (
              <ToggleGroupItem key={r} value={r} aria-label={ROLE_NAMES[r]} title={ROLE_NAMES[r]} className="data-[state=on]:[&_img]:brightness-0">
                <RoleIcon position={r} className="size-4" />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {member && (
          <ToggleGroup
            type="single"
            value={search.status ?? ''}
            onValueChange={(v) => update({ status: (v || undefined) as LeaderboardSearch['status'] })}
            variant="outline"
            size="sm"
            aria-label="Status"
          >
            <ToggleGroupItem value="free">Not in game</ToggleGroupItem>
            <ToggleGroupItem value="live">In game</ToggleGroupItem>
            <ToggleGroupItem value="decay">Decay soon</ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className="relative ml-auto w-full sm:w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search.q ?? ''} onChange={(e) => update({ q: e.target.value || undefined })} placeholder="Filter by name" aria-label="Filter by name" className="h-8 pl-8" />
        </div>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={() => update({ tiers: undefined, role: undefined, status: undefined, shared: undefined, q: undefined })}>
            <XIcon />
            Clear
          </Button>
        )}
      </div>

      <div
        className={cn('mb-1 hidden gap-x-4 px-3 text-xs text-muted-foreground md:grid', member ? COLS_MEMBER : COLS_PUBLIC)}
        aria-hidden
      >
        <span className="text-center">#</span>
        {member && <span>Role</span>}
        <span>Player</span>
        <span>Rank</span>
        {member && <span>24 hours</span>}
        <span>Win rate</span>
        {member && <span>Top 3</span>}
        {member && <span>Status</span>}
        {member && <span />}
      </div>

      {visible.length ? (
        <ol className="grid gap-1.5">
          {visible.map((a) => (
            <LeaderRow key={a.id} a={a} place={places.get(a.id) ?? 0} queue={queue} meId={me?.id} />
          ))}
        </ol>
      ) : (
        <div className="rounded-[10px] border border-dashed py-16 text-center">
          {accounts.length === 0 ? (
            <>
              <p className="text-lg font-semibold">No accounts yet. Add one with its Riot ID.</p>
              {member ? (
                <Button asChild className="mt-4">
                  <Link to="/add">Add account</Link>
                </Button>
              ) : (
                <p className="mt-2 text-muted-foreground">Members can add accounts after signing in with Discord.</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No accounts match these filters.</p>
          )}
        </div>
      )}
    </main>
  )
}
