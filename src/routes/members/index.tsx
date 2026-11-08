import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ChampIcon, RankLabel } from '#/components/game/GameArt'
import { useChampion } from '#/components/game/StaticDataProvider'
import { listMembers } from '#/server/members.functions'

export const Route = createFileRoute('/members/')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loader: () => listMembers(),
  head: () => ({ meta: [{ title: 'Members – Smurf Ladder' }] }),
  component: Members,
})

type MemberCard = Awaited<ReturnType<typeof listMembers>>[number]

function Card({ m }: { m: MemberCard }) {
  const { alias } = useChampion(m.bannerChampionId ?? 0)
  return (
    <li>
      <Link
        to="/members/$id"
        params={{ id: String(m.id) }}
        className="group relative isolate flex h-full flex-col overflow-hidden rounded-[10px] border bg-panel transition-colors hover:border-bone/50"
      >
        <div className="relative h-24 overflow-hidden">
          {alias && (
            <img
              src={`https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${alias}_0.jpg`}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover object-[center_25%] opacity-70 transition-opacity group-hover:opacity-90"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--panel)_0%,transparent_75%)]" />
        </div>
        <div className="-mt-8 flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className="flex items-end gap-3">
            {m.avatar ? (
              <img src={m.avatar} alt="" className="relative size-14 rounded-full ring-4 ring-panel" />
            ) : (
              <span className="relative grid size-14 place-items-center rounded-full bg-panel-raised text-lg font-bold ring-4 ring-panel">{(m.name ?? '?').slice(0, 1)}</span>
            )}
            <div className="min-w-0 pb-1">
              <div className="wide truncate text-lg font-extrabold">{m.name ?? 'Unnamed member'}</div>
              <div className="text-xs text-muted-foreground">
                {m.accountCount} {m.accountCount === 1 ? 'account' : 'accounts'}
                {m.inGame && <span className="ml-2 rounded-sm bg-loss px-1 font-bold text-white">Live</span>}
              </div>
            </div>
          </div>
          {m.tagline && <p className="line-clamp-2 text-sm text-muted-foreground">{m.tagline}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
            {m.best ? <RankLabel tier={m.best.tier} rank={m.best.rank} lp={m.best.lp} className="text-sm" /> : <span className="text-sm text-muted-foreground">No ranked accounts</span>}
            <span className="flex -space-x-1.5">
              {m.topChamps.map((c) => (
                <ChampIcon key={c} id={c} size={24} className="rounded-full ring-2 ring-panel" />
              ))}
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}

function Members() {
  const members = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-8 pb-20 sm:pt-10">
      <h1 className="wide text-2xl leading-none font-extrabold tracking-tight sm:text-hero">Members</h1>
      <p className="mt-2 mb-8 text-muted-foreground">Everyone in the group, with their best account and most played champions.</p>
      {members.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <Card key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No members yet.</p>
      )}
    </main>
  )
}
