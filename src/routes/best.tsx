import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { ChampIcon, PlacementBadge } from '#/components/game/GameArt'
import { useChampion } from '#/components/game/StaticDataProvider'
import { Tabs, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { getBestGames, type BestGame } from '#/server/members.functions'
import { QUEUE_NAMES } from '#/lib/match'
import { ago } from '#/lib/time'
import { cn } from '#/lib/utils'

const search = z.object({ range: z.enum(['week', 'month', 'season']).optional() })

export const Route = createFileRoute('/best')({
  validateSearch: search,
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loaderDeps: ({ search }) => ({ range: search.range ?? 'week' }),
  loader: ({ deps }) => getBestGames({ data: { range: deps.range } }),
  head: () => ({ meta: [{ title: 'Best games – Smurf Ladder' }] }),
  component: BestGames,
})

const RANGE_LABEL = { week: 'this week', month: 'in the last 30 days', season: 'this season' } as const

function Row({ g, place }: { g: BestGame; place: number }) {
  const { name } = useChampion(g.championId)
  const kda = g.deaths === 0 ? g.kills + g.assists : (g.kills + g.assists) / g.deaths
  return (
    <li
      className={cn(
        'grid grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[10px] border-l-4 px-4 py-3 sm:grid-cols-[2.5rem_auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]',
        g.win ? 'border-l-win bg-win-tint' : 'border-l-loss bg-loss-tint',
      )}
    >
      <span className="wide nums text-center text-xl font-extrabold" style={{ color: place <= 3 ? 'var(--bone)' : 'var(--muted-ink)' }}>
        {place}
      </span>
      <ChampIcon id={g.championId} size={44} />
      <div className="min-w-0">
        <Link to="/accounts/$id" params={{ id: String(g.accountId) }} className="block truncate font-semibold underline-offset-4 hover:underline">
          {g.gameName}
          <span className="font-normal text-muted-foreground">#{g.tagLine}</span>
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {name} in {QUEUE_NAMES[g.queue === 'solo' ? 420 : 440]}, {ago(g.endedAt)}
          {g.ownerName && (
            <>
              {', '}
              <Link to="/members/$id" params={{ id: String(g.ownerId) }} className="hover:text-foreground">
                {g.ownerName}
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="nums col-start-3 row-start-2 text-sm sm:col-start-auto sm:row-start-auto">
        <span className="wide font-extrabold">
          {g.kills} / <span style={{ color: 'var(--drop)' }}>{g.deaths}</span> / {g.assists}
        </span>
        <span className="block text-xs whitespace-nowrap text-muted-foreground">
          {kda.toFixed(2)} KDA, {(g.cs / (g.durationS / 60)).toFixed(1)} CS/min
        </span>
      </div>
      <span className="hidden sm:block">
        <PlacementBadge placement={g.placement} badge={g.badge} />
      </span>
      <div className="nums col-start-4 row-span-2 row-start-1 text-right sm:col-start-auto sm:row-span-1 sm:row-start-auto">
        <div className="wide text-2xl leading-none font-extrabold">{g.score.toFixed(1)}</div>
        <div className="text-[11px] text-muted-foreground">{g.win ? 'Victory' : 'Defeat'}</div>
      </div>
    </li>
  )
}

function BestGames() {
  const games = Route.useLoaderData()
  const range = Route.useSearch().range ?? 'week'
  const navigate = Route.useNavigate()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-20 sm:pt-10">
      <h1 className="wide text-2xl leading-none font-extrabold tracking-tight sm:text-hero">Best games</h1>
      <p className="mt-2 mb-6 text-muted-foreground">The group’s highest game scores {RANGE_LABEL[range]}, across every tracked account.</p>
      <Tabs value={range} onValueChange={(v) => navigate({ search: { range: v === 'week' ? undefined : (v as 'month' | 'season') } })} className="mb-5">
        <TabsList>
          <TabsTrigger value="week">This week</TabsTrigger>
          <TabsTrigger value="month">30 days</TabsTrigger>
          <TabsTrigger value="season">Season</TabsTrigger>
        </TabsList>
      </Tabs>
      {games.length ? (
        <ol className="grid gap-2">
          {games.map((g, i) => (
            <Row key={`${g.matchId}-${g.accountId}`} g={g} place={i + 1} />
          ))}
        </ol>
      ) : (
        <div className="rounded-[10px] border border-dashed py-16 text-center text-muted-foreground">No scored games {RANGE_LABEL[range]} yet. Match history is still loading.</div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Score is our own estimate (0–10) against the other nine players in each game. Ties are broken by kills.
      </p>
    </main>
  )
}
