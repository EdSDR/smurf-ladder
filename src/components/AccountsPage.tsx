import { Link, useNavigate } from '@tanstack/react-router'
import { SearchIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import type { Me } from '#/server/auth.functions'
import { TIER_META, isTier, rankScore, tierIndex } from '#/lib/tiers'
import { cn } from '#/lib/utils'
import { AccountRow, type Row } from './AccountRow'
import { Ladder, UNRANKED, type Queue } from './Ladder'

export const accountsSearch = z.object({
  tiers: z.string().optional(),
  queue: z.enum(['solo', 'flex']).optional(),
  free: z.boolean().optional(),
  shared: z.boolean().optional(),
  q: z.string().optional(),
})
export type AccountsSearch = z.infer<typeof accountsSearch>

function tierRange(accounts: Row[], queue: Queue) {
  const ranked = accounts.map((a) => a[queue]?.tier).filter(isTier)
  if (!ranked.length) return null
  const sorted = [...ranked].sort((a, b) => tierIndex(a) - tierIndex(b))
  const low = TIER_META[sorted[0]].name
  const high = TIER_META[sorted[sorted.length - 1]].name
  return low === high ? `all ${low}` : `${low} to ${high}`
}

type Props = {
  accounts: Row[]
  me: Me | null
  search: AccountsSearch
  scope: 'all' | 'mine'
}

export function AccountsPage({ accounts, me, search, scope }: Props) {
  const navigate = useNavigate()
  const queue: Queue = search.queue ?? 'solo'
  const selected = search.tiers ? search.tiers.split(',') : []
  const update = (patch: Partial<AccountsSearch>) =>
    navigate({ to: '.', search: (prev: AccountsSearch) => ({ ...prev, ...patch }), replace: true, resetScroll: false })

  const scoped = useMemo(() => (scope === 'mine' && me ? accounts.filter((a) => a.ownerId === me.id) : accounts), [accounts, scope, me])

  const visible = useMemo(() => {
    const needle = search.q?.trim().toLowerCase()
    return scoped
      .filter((a) => {
        const tier = a[queue]?.tier
        const step = isTier(tier) ? tier : UNRANKED
        if (selected.length && !selected.includes(step)) return false
        if (search.free && (a.inGame || a.claimedBy)) return false
        if (search.shared && !(a.shared && a.hasCredentials)) return false
        if (needle && !`${a.gameName}#${a.tagLine}`.toLowerCase().includes(needle)) return false
        return true
      })
      .sort((x, y) => rankScore(y[queue]?.tier ?? null, y[queue]?.rank ?? null, y[queue]?.lp ?? null) - rankScore(x[queue]?.tier ?? null, x[queue]?.rank ?? null, x[queue]?.lp ?? null))
  }, [scoped, queue, selected.join(), search.free, search.shared, search.q]) // eslint-disable-line react-hooks/exhaustive-deps

  const range = tierRange(scoped, queue)
  const toggleTier = (t: string) => {
    const next = selected.includes(t) ? selected.filter((s) => s !== t) : [...selected, t]
    update({ tiers: next.length ? next.join(',') : undefined })
  }
  const filtering = selected.length > 0 || search.free || search.shared || !!search.q

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:pt-12">
      <section aria-labelledby="ladder-title" className="mb-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 id="ladder-title" className="wide text-2xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-[3.25rem]">
              {scoped.length === 0
                ? scope === 'mine'
                  ? 'You haven’t added any accounts'
                  : 'No accounts on the ladder yet'
                : `${scoped.length} ${scoped.length === 1 ? 'account' : 'accounts'}${range ? `, ${range}` : ''}`}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {queue === 'solo' ? 'Solo/Duo' : 'Flex'} ranks on BR. Pick a tier to see which accounts can play there.
            </p>
          </div>
          <div className="flex rounded-md border p-0.5" role="group" aria-label="Queue">
            {(['solo', 'flex'] as const).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={queue === q}
                onClick={() => update({ queue: q === 'solo' ? undefined : q })}
                className={cn('rounded px-3 py-1 text-sm transition-colors', queue === q ? 'bg-bone font-semibold text-rift' : 'text-muted-foreground hover:text-foreground')}
              >
                {q === 'solo' ? 'Solo/Duo' : 'Flex'}
              </button>
            ))}
          </div>
        </div>
        <Ladder accounts={scoped} queue={queue} selected={selected} onToggle={toggleTier} />
      </section>

      <section aria-label="Accounts">
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-b bg-rift/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-1">
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.q ?? ''}
              onChange={(e) => update({ q: e.target.value || undefined })}
              placeholder="Find by Riot ID"
              aria-label="Find by Riot ID"
              className="pl-8"
            />
          </div>
          {me && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!search.free} onCheckedChange={(v) => update({ free: v || undefined })} />
                Free right now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!search.shared} onCheckedChange={(v) => update({ shared: v || undefined })} />
                Shared logins only
              </label>
            </>
          )}
          {filtering && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => update({ tiers: undefined, free: undefined, shared: undefined, q: undefined })}>
              <XIcon />
              Clear filters
            </Button>
          )}
        </div>

        {visible.length ? (
          <ul>
            {visible.map((a) => (
              <AccountRow key={a.id} account={a} queue={queue} meId={me?.id} />
            ))}
          </ul>
        ) : (
          <div className="py-16 text-center">
            {scoped.length === 0 ? (
              <>
                <p className="text-lg font-semibold">No accounts yet. Add one with its Riot ID.</p>
                {me ? (
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
      </section>
    </main>
  )
}
