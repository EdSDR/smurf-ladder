import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RememberDevice, UnlockForm } from '#/components/UnlockForm'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { grantGroupKey, listPendingGrants } from '#/server/vault.functions'
import { fingerprint, wrapForMember } from '#/vault/crypto'
import { useVault } from '#/vault/VaultProvider'

export const Route = createFileRoute('/vault')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  component: VaultPage,
})

const MIN_PASSPHRASE = 10

function VaultPage() {
  const vault = useVault()
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="wide text-2xl font-extrabold tracking-tight">Vault</h1>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">
        Logins are encrypted in your browser before they’re saved. The server, and whoever runs it, only ever stores scrambled data.
      </p>
      <div className="mt-8">
        {vault.status === 'loading' && <p className="text-muted-foreground">Opening vault…</p>}
        {vault.status === 'no-vault' && <SetupForm />}
        {vault.status === 'locked' && <UnlockForm />}
        {vault.status === 'unlocked' && <Unlocked />}
      </div>
    </main>
  )
}

function SetupForm() {
  const vault = useVault()
  const router = useRouter()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const tooShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE
  const mismatch = confirm.length > 0 && confirm !== passphrase

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await vault.setup(passphrase, remember)
          toast.success('Vault ready')
          await router.invalidate()
        } catch (err) {
          toast.error((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2 className="text-lg font-semibold">Choose a vault passphrase</h2>
      <p className="-mt-2 text-sm text-muted-foreground">
        It’s separate from Discord and never leaves this browser. If you forget it, logins private to you can’t be recovered. Shared logins can be
        re-granted by another member.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="new-passphrase">Passphrase</Label>
        <Input
          id="new-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-invalid={tooShort}
          aria-describedby="passphrase-hint"
          required
        />
        <p id="passphrase-hint" className="text-xs text-muted-foreground">
          At least {MIN_PASSPHRASE} characters. A few random words works well.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-passphrase">Type it again</Label>
        <Input
          id="confirm-passphrase"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          required
        />
        {mismatch && <p className="text-sm text-destructive">The passphrases don’t match.</p>}
      </div>
      <RememberDevice checked={remember} onChange={setRemember} />
      <Button type="submit" disabled={busy || passphrase.length < MIN_PASSPHRASE || passphrase !== confirm}>
        {busy ? 'Creating keys…' : 'Create vault'}
      </Button>
    </form>
  )
}

function useFingerprint(spki: string | null) {
  const [fp, setFp] = useState<string | null>(null)
  useEffect(() => {
    if (spki) fingerprint(spki).then(setFp)
  }, [spki])
  return fp
}

function Fingerprint({ value }: { value: string | null }) {
  return <code className="nums wide rounded bg-panel px-2 py-1 font-sans text-sm font-bold tracking-wider">{value ?? '…'}</code>
}

function Unlocked() {
  const vault = useVault()
  const myFp = useFingerprint(vault.publicKey)

  return (
    <div className="grid gap-10">
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Your vault is unlocked</h2>
        <p className="text-sm text-muted-foreground">
          Your key fingerprint is <Fingerprint value={myFp} />
        </p>
        {!vault.hasGroupAccess && (
          <div className="mt-2 rounded-md border bg-panel p-4 text-sm">
            <p className="font-semibold">Waiting for a member to approve you</p>
            <p className="mt-1 text-muted-foreground">
              Send your fingerprint to the group on Discord. A member compares it with the one they see, then approves you. After that you can see
              and share logins.
            </p>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <Button variant="outline" onClick={() => vault.lock()}>
            Lock vault
          </Button>
          <Button variant="ghost" onClick={() => vault.lock(true).then(() => toast.success('This device forgot your key'))}>
            Forget this device
          </Button>
        </div>
      </section>
      {vault.hasGroupAccess && <PendingApprovals />}
    </div>
  )
}

type Pending = Awaited<ReturnType<typeof listPendingGrants>>[number]

function PendingApprovals() {
  const [pending, setPending] = useState<Pending[] | null>(null)
  const load = () => listPendingGrants().then(setPending)
  useEffect(() => {
    load()
  }, [])

  return (
    <section aria-labelledby="pending-heading" className="grid gap-3">
      <h2 id="pending-heading" className="text-lg font-semibold">
        Members waiting for access
      </h2>
      {pending === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is waiting.</p>
      ) : (
        <ul className="grid">
          {pending.map((m) => (
            <PendingRow key={m.id} member={m} onDone={load} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PendingRow({ member, onDone }: { member: Pending; onDone: () => void }) {
  const vault = useVault()
  const fp = useFingerprint(member.publicKey)
  const [busy, setBusy] = useState(false)
  return (
    <li className="flex flex-wrap items-center gap-3 border-t py-3">
      {member.avatar ? <img src={member.avatar} alt="" className="size-8 rounded-full" /> : <span className="size-8 rounded-full bg-panel-raised" />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{member.name ?? 'Unnamed member'}</div>
        <div className="text-sm text-muted-foreground">
          Fingerprint <Fingerprint value={fp} />
        </div>
      </div>
      <Button
        size="sm"
        disabled={busy || !vault.groupKey}
        onClick={async () => {
          setBusy(true)
          try {
            const wrapped = await wrapForMember(vault.groupKey!, member.publicKey)
            await grantGroupKey({ data: { memberId: member.id, keyVersion: vault.groupVersion!, wrappedGroupKey: wrapped } })
            toast.success(`Approved ${member.name ?? 'member'}`)
            onDone()
          } catch (e) {
            toast.error((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        Fingerprints match, approve
      </Button>
    </li>
  )
}
