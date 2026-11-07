import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { RankText } from '#/components/AccountRow'
import { ProfileIcon } from '#/components/TierMark'
import { UnlockForm } from '#/components/UnlockForm'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { LoginFields, ShareSwitch } from '#/components/LoginFields'
import { addAccount, lookupRiotId } from '#/server/accounts.functions'
import { useVault } from '#/vault/VaultProvider'

export const Route = createFileRoute('/add')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  component: AddAccount,
})

type Preview = Extract<Awaited<ReturnType<typeof lookupRiotId>>, { ok: true }>['preview']

function AddAccount() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const vault = useVault()
  const [riotId, setRiotId] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cred, setCred] = useState({ login: '', password: '', note: '' })
  const [shared, setShared] = useState(true)

  const hasLogin = !!(cred.login || cred.password)
  const needsVault = hasLogin && vault.status !== 'unlocked'
  const shareBlocked = vault.status === 'unlocked' && !vault.hasGroupAccess ? 'Sharing unlocks once a member approves your vault.' : undefined

  async function find(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setLookupError(null)
    setPreview(null)
    try {
      const res = await lookupRiotId({ data: { riotId } })
      if (res.ok) setPreview(res.preview)
      else setLookupError(res.error)
    } catch (err) {
      setLookupError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const share = shared && !shareBlocked
      const credential = hasLogin ? await vault.seal({ login: cred.login, password: cred.password, note: cred.note || undefined }, share) : null
      const { id } = await addAccount({ data: { riotId, shared: share, credential } })
      toast.success('Account added')
      await router.invalidate()
      navigate({ to: '/', hash: `account-${id}` })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="wide text-2xl font-extrabold tracking-tight">Add account</h1>
      <p className="mt-2 text-muted-foreground">Start with the Riot ID. Ranks refresh on their own every few minutes.</p>

      <form onSubmit={find} className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="riot-id">Riot ID</Label>
          <Input
            id="riot-id"
            placeholder="Name#BR1"
            value={riotId}
            onChange={(e) => {
              setRiotId(e.target.value)
              setPreview(null)
            }}
            aria-invalid={!!lookupError}
            autoFocus
            required
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !riotId.includes('#')}>
          {busy && !preview ? 'Finding…' : 'Find account'}
        </Button>
      </form>
      {lookupError && <p className="mt-2 text-sm text-destructive">{lookupError}</p>}

      {preview && (
        <div className="mt-8 grid gap-8">
          <div className="flex items-center gap-4 border-y py-4">
            <ProfileIcon iconId={preview.iconId} className="size-14" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">
                {preview.gameName}
                <span className="font-normal text-muted-foreground">#{preview.tagLine}</span>
              </div>
              <RankText tier={preview.solo?.tier ?? null} rank={preview.solo?.rank ?? null} lp={preview.solo?.lp} className="text-sm" />
            </div>
            <span className="ml-auto text-sm text-muted-foreground">{preview.level ? `Level ${preview.level}` : ''}</span>
          </div>

          <section className="grid gap-5" aria-labelledby="login-heading">
            <div>
              <h2 id="login-heading" className="text-lg font-semibold">
                Login (optional)
              </h2>
              <p className="text-sm text-muted-foreground">Encrypted in your browser before it’s saved. The server never sees it.</p>
            </div>
            <LoginFields {...cred} onChange={(p) => setCred((c) => ({ ...c, ...p }))} />
            <ShareSwitch shared={shared && !shareBlocked} onChange={setShared} disabledReason={shareBlocked} />
            {needsVault && (
              <div className="rounded-md border bg-panel p-4">
                {vault.status === 'no-vault' ? (
                  <p className="text-sm">
                    Saving a login needs your vault.{' '}
                    <Link to="/vault" className="underline underline-offset-4">
                      Set up your vault
                    </Link>{' '}
                    first, or add the account without a login.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-sm">Unlock your vault to encrypt this login.</p>
                    <UnlockForm />
                  </>
                )}
              </div>
            )}
          </section>

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || needsVault || (hasLogin && (!cred.login || !cred.password))}>
              {busy ? 'Adding…' : 'Add account'}
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">Cancel</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
