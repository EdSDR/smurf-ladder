import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { CopyIcon, KeyRoundIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { MatchRow, LiveGamePanel } from '#/components/account/Matches'
import { LpHistoryChart, MatchPerformance } from '#/components/account/Performance'
import { ChampionTable, MostPlayed, Panel, RankedCard } from '#/components/account/Ranked'
import { CredentialView } from '#/components/CredentialDialog'
import { RankLabel, SplashBanner } from '#/components/game/GameArt'
import { ProfileIcon } from '#/components/TierMark'
import { UnlockForm } from '#/components/UnlockForm'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { ago } from '#/lib/time'
import { cn } from '#/lib/utils'
import { deleteAccount, getAccountDetail, getCredential, getMatchPage, refreshNow, saveCredential } from '#/server/accounts.functions'
import type { MatchEntry } from '#/server/accounts.server'
import { useVault } from '#/vault/VaultProvider'
import { LoginFields, ShareSwitch } from '#/components/LoginFields'

export const Route = createFileRoute('/accounts/$id')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getAccountDetail({ data: { accountId: Number(params.id) } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.account.gameName}#${loaderData.account.tagLine} – Smurf Ladder` : 'Smurf Ladder' }] }),
  component: AccountDetail,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-6xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">{(error as Error).message}</h1>
      <Link to="/" className="mt-4 inline-block underline underline-offset-4">
        Back to the leaderboard
      </Link>
    </main>
  ),
})

function HistoryNotice({ state, pending, stored }: { state: 'todo' | 'listed' | 'done'; pending: number; stored: number }) {
  if (state === 'done') return null
  const text = state === 'todo' ? 'Match history will start loading within a few minutes.' : `Loading match history: ${stored} games so far, ${pending} to go.`
  return <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{text}</p>
}

function MatchList({ first, accountId, selfName, selfTag, tracked, limit }: { first: MatchEntry[]; accountId: number; selfName: string; selfTag: string; tracked: Record<string, number>; limit?: number }) {
  const [pages, setPages] = useState<MatchEntry[]>([])
  const [done, setDone] = useState(first.length < 20)
  const [busy, setBusy] = useState(false)
  const all = [...first, ...pages]
  const shown = limit ? all.slice(0, limit) : all
  if (!all.length) return <p className="text-sm text-muted-foreground">No ranked games loaded yet. They appear after the next refresh.</p>
  return (
    <div className="grid gap-2">
      <ol className="grid gap-2">
        {shown.map((m) => (
          <MatchRow key={m.matchId} m={m} selfName={selfName} selfTag={selfTag} tracked={tracked} />
        ))}
      </ol>
      {!limit && !done && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const next = await getMatchPage({ data: { accountId, before: all[all.length - 1].endedAt } })
            setPages((p) => [...p, ...next])
            setDone(next.length < 20)
            setBusy(false)
          }}
        >
          {busy ? 'Loading…' : 'Load older games'}
        </Button>
      )}
    </div>
  )
}

function AccountDetail() {
  const data = Route.useLoaderData()
  const { account, history, matches, tracked, liveGame } = data
  const { me } = Route.useRouteContext()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const riotId = `${account.gameName}#${account.tagLine}`
  const isOwner = account.ownerId === me!.id || me!.role === 'admin'
  const canSeeLogin = account.hasCredentials && (account.shared || account.ownerId === me!.id)
  const bannerChamp = data.champStats[0]?.champion ?? liveGame?.championId ?? null
  const chartGames = matches.filter((m) => !m.remake).slice(0, 20)

  async function refresh() {
    setBusy(true)
    try {
      await refreshNow({ data: { accountId: account.id } })
      toast.success('Account refreshed')
      await router.invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-20">
      <SplashBanner championId={bannerChamp} className="mb-6">
        <div className="flex min-h-48 flex-col justify-end gap-4 p-5 sm:min-h-56 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="flex items-end gap-4">
            <span className="relative shrink-0">
              <ProfileIcon iconId={account.iconId} className="size-20 rounded-full ring-2 ring-bone/70 sm:size-24" />
              {account.level && (
                <span className="nums absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md border bg-rift px-1.5 text-xs font-semibold">{account.level}</span>
              )}
            </span>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                {data.place && <span className="rounded-md bg-bone px-1.5 py-0.5 font-bold text-rift">#{data.place} in the group</span>}
                <span className="rounded-md border bg-rift/70 px-1.5 py-0.5">{account.shared ? 'Shared login' : 'Private login'}</span>
                {account.inGame && <span className="rounded-md bg-loss px-1.5 py-0.5 font-bold text-white">Live</span>}
              </div>
              <h1 className="wide text-2xl leading-tight font-extrabold tracking-tight break-words sm:text-[2.5rem]">
                {account.gameName}
                <span className="font-semibold text-muted-foreground">#{account.tagLine}</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <RankLabel tier={account.solo?.tier ?? null} rank={account.solo?.rank ?? null} lp={account.solo?.lp} />
                <span className="text-muted-foreground">
                  Added by{' '}
                  <Link to="/members/$id" params={{ id: String(account.ownerId) }} className="text-foreground underline-offset-4 hover:underline">
                    {account.ownerName ?? 'a former member'}
                  </Link>
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="bg-rift/70" onClick={refresh} disabled={busy}>
              <RefreshCwIcon className={cn(busy && 'animate-spin motion-reduce:animate-none')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              className="bg-rift/70"
              onClick={async () => {
                await navigator.clipboard.writeText(riotId)
                toast.success('Riot ID copied')
              }}
            >
              <CopyIcon />
              Copy Riot ID
            </Button>
          </div>
        </div>
      </SplashBanner>

      <Tabs defaultValue={account.inGame && liveGame ? 'live' : 'overview'}>
        <TabsList variant="line" className="mb-5 w-full justify-start overflow-x-auto border-b">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {liveGame && (
            <TabsTrigger value="live">
              <span className="size-2 rounded-full bg-loss" aria-hidden />
              Live game
            </TabsTrigger>
          )}
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="champions">Champions</TabsTrigger>
          {(canSeeLogin || isOwner) && (
            <TabsTrigger value="login">
              <KeyRoundIcon />
              Login
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="grid content-start gap-5">
              <RankedCard label="Ranked Solo/Duo" queue="solo" q={account.solo} lp={account.lp.solo} refreshedAt={account.refreshedAt} />
              <RankedCard label="Ranked Flex" queue="flex" q={account.flex} lp={account.lp.flex} refreshedAt={account.refreshedAt} />
              <Panel title="Most played champions">
                <MostPlayed stats={data.champStats} />
              </Panel>
              <Panel title="Solo/Duo rank history">
                <LpHistoryChart points={history.filter((h) => h.queue === 'solo')} />
              </Panel>
            </div>
            <div className="grid content-start gap-5">
              <HistoryNotice {...account.history} />
              <Panel title="Match performance" action={<span className="rounded-md bg-panel-raised px-2 py-0.5 text-xs">Last 20 games</span>}>
                <MatchPerformance summary={data.last20} games={chartGames} champStats={data.champStats} />
              </Panel>
              <MatchList first={matches} accountId={account.id} selfName={account.gameName} selfTag={account.tagLine} tracked={tracked} limit={8} />
              {matches.length > 8 && (
                <p className="text-center text-sm text-muted-foreground">See every stored game on the Matches tab.</p>
              )}
            </div>
          </div>
        </TabsContent>

        {liveGame && (
          <TabsContent value="live">
            <LiveGamePanel game={liveGame} tracked={tracked} />
          </TabsContent>
        )}

        <TabsContent value="matches">
          <MatchList first={matches} accountId={account.id} selfName={account.gameName} selfTag={account.tagLine} tracked={tracked} />
        </TabsContent>

        <TabsContent value="champions">
          <Panel title="Champions" action={<span className="text-xs text-muted-foreground">Stored ranked games</span>}>
            <ChampionTable stats={data.champStats} />
          </Panel>
        </TabsContent>

        {(canSeeLogin || isOwner) && (
          <TabsContent value="login">
            <div className="grid max-w-2xl gap-6">
              <Panel title="Login" action={<span className="text-xs text-muted-foreground">{account.shared ? 'Shared with all members' : account.ownerId === me!.id ? 'Private to you' : `Private to ${account.ownerName ?? 'its owner'}`}</span>}>
                {canSeeLogin ? (
                  <CredentialView accountId={account.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">{account.hasCredentials ? 'Only the member who added it can see this login.' : 'No login saved yet.'}</p>
                )}
              </Panel>
              {isOwner && <EditLogin accountId={account.id} shared={account.shared} hasCredentials={account.hasCredentials} />}
              {isOwner && <RemoveAccount accountId={account.id} riotId={riotId} />}
              <p className="text-xs text-muted-foreground">Rank checked {ago(account.refreshedAt)}.</p>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </main>
  )
}

function RemoveAccount({ accountId, riotId }: { accountId: number; riotId: string }) {
  const router = useRouter()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-fit">
          Remove from the leaderboard
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {riotId}?</DialogTitle>
          <DialogDescription>Its rank history, match history and saved login are deleted. The Riot account itself isn’t touched.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={async () => {
              try {
                await deleteAccount({ data: { accountId } })
                toast.success(`Removed ${riotId}`)
                await router.invalidate()
                router.navigate({ to: '/' })
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            Remove account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Owners edit the login and sharing here; changing either re-encrypts in the browser. */
function EditLogin({ accountId, shared: initialShared, hasCredentials }: { accountId: number; shared: boolean; hasCredentials: boolean }) {
  const vault = useVault()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cred, setCred] = useState({ login: '', password: '', note: '' })
  const [shared, setShared] = useState(initialShared)
  const [busy, setBusy] = useState(false)
  const shareBlocked = !vault.hasGroupAccess ? 'Sharing unlocks once a member approves your vault.' : undefined

  async function start() {
    if (hasCredentials) {
      try {
        const sealed = await getCredential({ data: { accountId } })
        if (sealed) {
          const c = await vault.open(sealed)
          setCred({ login: c.login, password: c.password, note: c.note ?? '' })
        }
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
    }
    setOpen(true)
  }

  async function save() {
    setBusy(true)
    try {
      const share = shared && !shareBlocked
      const has = cred.login || cred.password || cred.note
      const credential = has ? await vault.seal({ login: cred.login, password: cred.password, note: cred.note || undefined }, share) : null
      await saveCredential({ data: { accountId, shared: share, credential } })
      toast.success(has ? 'Login saved' : 'Login removed')
      setOpen(false)
      await router.invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="edit-heading" className="border-t pt-6">
      <h2 id="edit-heading" className="mb-4 text-lg font-semibold">
        {hasCredentials ? 'Change login or sharing' : 'Save a login'}
      </h2>
      {vault.status === 'no-vault' ? (
        <p className="text-sm text-muted-foreground">
          <Link to="/vault" className="text-foreground underline underline-offset-4">
            Set up your vault
          </Link>{' '}
          to save logins.
        </p>
      ) : vault.status !== 'unlocked' ? (
        <UnlockForm />
      ) : open ? (
        <div className="grid gap-5">
          <LoginFields {...cred} onChange={(p) => setCred((c) => ({ ...c, ...p }))} />
          <ShareSwitch shared={shared && !shareBlocked} onChange={setShared} disabledReason={shareBlocked} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save login'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {hasCredentials && <p className="text-xs text-muted-foreground">Clear every field and save to delete the login.</p>}
        </div>
      ) : (
        <Button variant="outline" onClick={start}>
          {hasCredentials ? 'Edit login' : 'Add login'}
        </Button>
      )}
    </section>
  )
}
