import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { CheckIcon, ChevronsUpDownIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MatchPerformance } from '#/components/account/Performance'
import { MostPlayed, Panel } from '#/components/account/Ranked'
import { ChampIcon, RankLabel, SplashBanner } from '#/components/game/GameArt'
import { useStaticData } from '#/components/game/StaticDataProvider'
import { ProfileIcon } from '#/components/TierMark'
import { Button } from '#/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '#/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { getMember, updateProfile } from '#/server/members.functions'
import { formatRank } from '#/lib/tiers'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/members/$id')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getMember({ data: { memberId: Number(params.id) } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.member.name ?? 'Member'} – Smurf Ladder` : 'Smurf Ladder' }] }),
  component: MemberPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-7xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">{(error as Error).message}</h1>
      <Link to="/members" className="mt-4 inline-block underline underline-offset-4">
        See all members
      </Link>
    </main>
  ),
})

/** Searchable champion picker for the profile banner. */
function ChampionPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const data = useStaticData()
  const [open, setOpen] = useState(false)
  const champions = Object.entries(data?.champions ?? {})
    .map(([id, [name]]) => ({ id: Number(id), name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const selected = champions.find((c) => c.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          <span className="flex items-center gap-2">
            {selected ? <ChampIcon id={selected.id} size={20} /> : null}
            {selected ? selected.name : 'Most played champion'}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search champions" />
          <CommandList className="max-h-64">
            <CommandEmpty>No champion with that name.</CommandEmpty>
            <CommandItem
              value="most played"
              onSelect={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Most played champion
              {value === null && <CheckIcon className="ml-auto" />}
            </CommandItem>
            {champions.map((c) => (
              <CommandItem
                key={c.id}
                value={c.name}
                onSelect={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                <ChampIcon id={c.id} size={20} />
                {c.name}
                {value === c.id && <CheckIcon className="ml-auto" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function EditProfile({ banner, tagline }: { banner: number | null; tagline: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [champ, setChamp] = useState(banner)
  const [text, setText] = useState(tagline ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-rift/70">
          <PencilIcon />
          Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Your name and picture come from Discord.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Banner champion</Label>
            <ChampionPicker value={champ} onChange={setChamp} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tagline">Tagline</Label>
            <Input id="tagline" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Jungle main, smurf collector" />
            <p className="nums text-xs text-muted-foreground">{text.length}/60</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await updateProfile({ data: { bannerChampionId: champ, tagline: text.trim() || null } })
                toast.success('Profile saved')
                setOpen(false)
                await router.invalidate()
              } catch (e) {
                toast.error((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MemberPage() {
  const data = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const { member, accounts } = data
  const [showUnranked, setShowUnranked] = useState(false)
  const shown = accounts.filter((a) => showUnranked || a.solo || a.flex)
  const hidden = accounts.length - shown.length
  const isMe = me?.id === member.id

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-20">
      <SplashBanner championId={data.bannerChampionId} className="mb-8">
        <div className="flex min-h-56 flex-col justify-end gap-4 p-5 sm:min-h-64 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="flex items-end gap-5">
            {member.avatar ? (
              <img src={member.avatar} alt="" className="size-24 rounded-full ring-4 ring-bone/70 sm:size-28" />
            ) : (
              <span className="grid size-24 place-items-center rounded-full bg-panel-raised text-3xl font-bold ring-4 ring-bone/70 sm:size-28">{(member.name ?? '?').slice(0, 1)}</span>
            )}
            <div className="min-w-0 pb-1">
              <h1 className="wide text-3xl leading-none font-extrabold tracking-tight sm:text-hero">{member.name ?? 'Unnamed member'}</h1>
              {member.tagline && <p className="mt-2 max-w-[48ch] text-muted-foreground">{member.tagline}</p>}
            </div>
          </div>
          {isMe && <EditProfile banner={member.bannerChampionId} tagline={member.tagline} />}
        </div>
      </SplashBanner>

      <section aria-labelledby="accounts-heading" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="accounts-heading" className="wide text-xl font-extrabold">
              Accounts
            </h2>
            <p className="text-sm text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} added by {isMe ? 'you' : member.name}
            </p>
          </div>
          {hidden > 0 || showUnranked ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showUnranked} onChange={(e) => setShowUnranked(e.target.checked)} className="accent-[var(--bone)]" />
              Show unranked accounts
            </label>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((a) => (
              <li key={a.id} className="min-w-0">
                <Link
                  to="/accounts/$id"
                  params={{ id: String(a.id) }}
                  className={cn('flex h-full min-w-0 items-center gap-3 rounded-[10px] border bg-panel p-3 transition-colors hover:border-bone/50', a.inGame && 'border-loss/60')}
                >
                  <ProfileIcon iconId={a.iconId} className="size-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {a.gameName}
                      <span className="font-normal text-muted-foreground">#{a.tagLine}</span>
                    </div>
                    {/* Long ranks ("Grandmaster 1936 LP") wrap the LP onto the next line instead of overflowing. */}
                    <RankLabel
                      tier={a.solo?.tier ?? a.flex?.tier ?? null}
                      rank={a.solo?.rank ?? a.flex?.rank ?? null}
                      lp={a.solo?.lp ?? a.flex?.lp}
                      className="flex-wrap gap-y-0 text-sm"
                    />
                  </div>
                  {a.inGame && <span className="shrink-0 rounded-sm bg-loss px-1 text-[10px] font-bold text-white">Live</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isMe ? (
              <>
                You haven’t added any accounts yet.{' '}
                <Link to="/add" className="text-foreground underline underline-offset-4">
                  Add one
                </Link>
                .
              </>
            ) : (
              'No ranked accounts yet.'
            )}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title="Top champions" action={<span className="text-xs text-muted-foreground">All accounts</span>}>
          <MostPlayed stats={data.champStats} />
        </Panel>
        <Panel title="Match performance" action={<span className="rounded-md bg-panel-raised px-2 py-0.5 text-xs">Last 20 games, all accounts</span>}>
          <MatchPerformance summary={data.last20} games={data.games} champStats={data.champStats} />
          {accounts.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Best account right now:{' '}
              {accounts[0].solo ? `${accounts[0].gameName}, ${formatRank(accounts[0].solo.tier, accounts[0].solo.rank)}` : 'none ranked in Solo/Duo'}.
            </p>
          )}
        </Panel>
      </div>
    </main>
  )
}
