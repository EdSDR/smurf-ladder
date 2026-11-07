import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { ChevronLeftIcon, CopyIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RankText } from '#/components/AccountRow'
import { CredentialView } from '#/components/CredentialDialog'
import { LpChart } from '#/components/LpChart'
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
import { DECAY_WARN_DAYS, decayAtRisk, winrate } from '#/lib/tiers'
import { ago, daysSince } from '#/lib/time'
import { cn } from '#/lib/utils'
import {
  deleteAccount,
  getAccountDetail,
  getCredential,
  refreshNow,
  saveCredential,
  setClaim,
  type QueueRank,
} from '#/server/accounts.functions'
import { useVault } from '#/vault/VaultProvider'
import { LoginFields, ShareSwitch } from '#/components/LoginFields'

export const Route = createFileRoute('/accounts/$id')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loader: ({ params }) => getAccountDetail({ data: { accountId: Number(params.id) } }),
  component: AccountDetail,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-6xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">{(error as Error).message}</h1>
      <Link to="/" className="mt-4 inline-block underline underline-offset-4">
        Back to the ladder
      </Link>
    </main>
  ),
})

function QueueStat({ label, q }: { label: string; q: QueueRank | null }) {
  const wr = q ? winrate(q.wins, q.losses) : null
  return (
    <div className="grid gap-1 border-t py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="grid gap-0.5">
        <RankText tier={q?.tier ?? null} rank={q?.rank ?? null} lp={q?.lp} />
        {q && (
          <span className="nums text-sm text-muted-foreground">
            {wr}% win rate, {q.wins}W {q.losses}L
          </span>
        )}
      </dd>
    </div>
  )
}

function AccountDetail() {
  const { account, history } = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const router = useRouter()
  const [queue, setQueue] = useState<'solo' | 'flex'>('solo')
  const [busy, setBusy] = useState<string | null>(null)
  const riotId = `${account.gameName}#${account.tagLine}`
  const isOwner = account.ownerId === me!.id || me!.role === 'admin'
  const canSeeLogin = account.hasCredentials && (account.shared || account.ownerId === me!.id)
  const mine = account.claimedBy?.id === me!.id
  const days = daysSince(account.lastRankedAt)
  const atRisk = decayAtRisk(account.solo?.tier ?? null, account.lastRankedAt)
  const q = account[queue]

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await fn()
      toast.success(done)
      await router.invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-20">
      <Link to="/" hash={`account-${account.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        All accounts
      </Link>

      <header className="mt-6 flex flex-wrap items-center gap-5">
        <ProfileIcon iconId={account.iconId} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="wide text-2xl leading-tight font-extrabold tracking-tight break-words">
            {account.gameName}
            <span className="font-medium text-muted-foreground">#{account.tagLine}</span>
          </h1>
          <RankText tier={q?.tier ?? null} rank={q?.rank ?? null} lp={q?.lp} className="mt-1 text-lg" />
        </div>
        <div className="flex flex-wrap gap-2">
          {!account.inGame && (!account.claimedBy || mine) && (
            <Button
              variant={mine ? 'secondary' : 'default'}
              disabled={busy === 'claim'}
              onClick={() => run('claim', () => setClaim({ data: { accountId: account.id, claim: !mine } }), mine ? `Released ${riotId}` : `You're on ${riotId}`)}
            >
              {mine ? 'Release' : "I'm on it"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy === 'refresh'}
            onClick={() => run('refresh', () => refreshNow({ data: { accountId: account.id } }), 'Rank refreshed')}
          >
            <RefreshCwIcon className={cn(busy === 'refresh' && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(riotId)
              toast.success('Riot ID copied')
            }}
          >
            <CopyIcon />
            Copy Riot ID
          </Button>
        </div>
      </header>

      <p className="mt-4 text-sm text-muted-foreground">
        {account.inGame
          ? 'In a game right now. '
          : account.claimedBy
            ? `${mine ? 'You are' : `${account.claimedBy.name ?? 'A member'} is`} on this account. `
            : 'Free to play. '}
        Added by {account.ownerName ?? 'a former member'}. Rank checked {ago(account.refreshedAt)}.
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="history-heading">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="history-heading" className="text-lg font-semibold">
              Rank history
            </h2>
            <div className="flex rounded-md border p-0.5" role="group" aria-label="Queue">
              {(['solo', 'flex'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={queue === k}
                  onClick={() => setQueue(k)}
                  className={cn('rounded px-3 py-1 text-sm', queue === k ? 'bg-bone font-semibold text-rift' : 'text-muted-foreground hover:text-foreground')}
                >
                  {k === 'solo' ? 'Solo/Duo' : 'Flex'}
                </button>
              ))}
            </div>
          </div>
          <LpChart key={queue} points={history.filter((h) => h.queue === queue)} />

          <dl className="mt-8 grid gap-x-8 sm:grid-cols-2">
            <QueueStat label="Solo/Duo" q={account.solo} />
            <QueueStat label="Flex" q={account.flex} />
            <div className="grid gap-1 border-t py-3">
              <dt className="text-sm text-muted-foreground">Last ranked game</dt>
              <dd className={cn(atRisk && 'font-semibold')}>
                {days === null ? 'None found' : days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'} ago`}
                {atRisk && <span className="block text-sm font-normal text-muted-foreground">Diamond and up can decay. Flagged after {DECAY_WARN_DAYS} days without ranked.</span>}
              </dd>
            </div>
            <div className="grid gap-1 border-t py-3">
              <dt className="text-sm text-muted-foreground">Summoner level</dt>
              <dd className="nums">{account.level ?? 'Unknown'}</dd>
            </div>
          </dl>
        </section>

        <aside className="grid content-start gap-10">
          <section aria-labelledby="login-heading">
            <h2 id="login-heading" className="mb-1 text-lg font-semibold">
              Login
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {account.shared ? 'Shared with all members.' : account.ownerId === me!.id ? 'Private to you.' : `Private to ${account.ownerName ?? 'its owner'}.`}
            </p>
            {canSeeLogin ? (
              <CredentialView accountId={account.id} />
            ) : (
              <p className="text-sm text-muted-foreground">{account.hasCredentials ? 'Only the member who added it can see this login.' : 'No login saved yet.'}</p>
            )}
          </section>

          {isOwner && <EditLogin accountId={account.id} shared={account.shared} hasCredentials={account.hasCredentials} />}

          {isOwner && (
            <section className="border-t pt-6">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">Remove from ladder</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Remove {riotId}?</DialogTitle>
                    <DialogDescription>Its rank history and saved login are deleted. The Riot account itself isn’t touched.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Keep it</Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await deleteAccount({ data: { accountId: account.id } })
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
            </section>
          )}
        </aside>
      </div>
    </main>
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
      const has = cred.login || cred.password
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
            <Button onClick={save} disabled={busy || (!!(cred.login || cred.password) && (!cred.login || !cred.password))}>
              {busy ? 'Saving…' : 'Save login'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {hasCredentials && <p className="text-xs text-muted-foreground">Clear both fields and save to delete the login.</p>}
        </div>
      ) : (
        <Button variant="outline" onClick={start}>
          {hasCredentials ? 'Edit login' : 'Add login'}
        </Button>
      )}
    </section>
  )
}
