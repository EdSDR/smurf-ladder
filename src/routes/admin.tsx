import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { inviteMember, listMembers, listSharedCredentials, removeMemberAndRotate } from '#/server/vault.functions'
import { decryptJson, encryptJson, fingerprint, generateAesKey, groupKeyFingerprint, wrapForMember } from '#/vault/crypto'
import { saveGroupPin } from '#/vault/keystore'
import { useVault } from '#/vault/VaultProvider'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (context.me?.role !== 'admin') throw redirect({ to: '/' })
  },
  loader: () => listMembers(),
  component: Admin,
})

type MemberRow = Awaited<ReturnType<typeof listMembers>>['members'][number]

function Admin() {
  const data = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const router = useRouter()
  const [discordId, setDiscordId] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="wide text-2xl font-extrabold tracking-tight">Members</h1>
      <p className="mt-2 text-muted-foreground">Only people on this list can sign in. Everyone else sees the public ladder.</p>

      <form
        className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await inviteMember({ data: { discordId: discordId.trim() } })
            toast.success('Member invited')
            setDiscordId('')
            await router.invalidate()
          } catch (err) {
            toast.error((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="discord-id">Discord user ID</Label>
          <Input id="discord-id" inputMode="numeric" placeholder="123456789012345678" value={discordId} onChange={(e) => setDiscordId(e.target.value)} required />
          <p className="text-xs text-muted-foreground">In Discord, turn on Developer Mode, then right-click the person and copy their user ID.</p>
        </div>
        <Button type="submit" disabled={busy || !discordId.trim()} className="sm:mb-6">
          Invite member
        </Button>
      </form>

      <ul className="mt-8">
        {data.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-t py-3">
            {m.avatar ? <img src={m.avatar} alt="" className="size-9 rounded-full" /> : <span className="size-9 rounded-full bg-panel-raised" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {m.name ?? `Discord ${m.discordId}`}
                {m.role === 'admin' && <span className="ml-2 text-sm font-normal text-muted-foreground">admin</span>}
              </div>
              <div className="text-sm text-muted-foreground">
                {m.status === 'invited' ? 'Invited, hasn’t signed in yet' : !m.publicKey ? 'No vault yet' : m.hasGroupKey ? 'Has vault access' : 'Waiting for vault approval'}
              </div>
            </div>
            {m.id !== me!.id && <RemoveMember member={m} meId={me!.id} groupVersion={data.groupVersion} members={data.members} />}
          </li>
        ))}
      </ul>
    </main>
  )
}

/**
 * Removing someone rotates the group key in this browser: shared logins are decrypted with
 * the old key, re-encrypted with a new one, and the new key is wrapped for everyone who stays.
 */
function RemoveMember({ member, meId, groupVersion, members }: { member: MemberRow; meId: number; groupVersion: number | null; members: MemberRow[] }) {
  const vault = useVault()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const needsRotation = groupVersion !== null
  const canRotate = !needsRotation || (vault.status === 'unlocked' && !!vault.groupKey)
  // Everyone who keeps access gets the new key. Listing their fingerprints lets the admin spot a
  // key the server slipped in.
  const stay = members.filter((m) => m.id !== member.id && m.hasGroupKey && m.publicKey)
  const [fps, setFps] = useState<Record<number, string>>({})
  useEffect(() => {
    Promise.all(stay.map(async (m) => [m.id, await fingerprint(m.publicKey!)] as const)).then((pairs) => setFps(Object.fromEntries(pairs)))
  }, [members]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove() {
    setBusy(true)
    try {
      let payload = { memberId: member.id, newVersion: 0, grants: [] as { memberId: number; wrappedGroupKey: string }[], credentials: [] as { accountId: number; ciphertext: string; iv: string }[] }
      if (needsRotation) {
        const oldKey = vault.groupKey!
        const newKey = await generateAesKey()
        const shared = await listSharedCredentials()
        const credentials = await Promise.all(
          shared.map(async (c) => ({ accountId: c.accountId, ...(await encryptJson(await decryptJson(c.ciphertext, c.iv, oldKey), newKey)) })),
        )
        const grants = await Promise.all(stay.map(async (m) => ({ memberId: m.id, wrappedGroupKey: await wrapForMember(newKey, m.publicKey!) })))
        payload = { memberId: member.id, newVersion: groupVersion + 1, grants, credentials }
        await removeMemberAndRotate({ data: payload })
        // This browser made the new key, so it trusts it without a "rotated" notice.
        await saveGroupPin(meId, { version: groupVersion + 1, fingerprint: await groupKeyFingerprint(newKey) })
      } else {
        await removeMemberAndRotate({ data: payload })
      }
      await vault.reload()
      toast.success(`Removed ${member.name ?? 'member'}`)
      await router.invalidate()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {member.name ?? 'this member'}?</DialogTitle>
          <DialogDescription>
            They lose access right away and the accounts they added move to you. Shared logins are re-encrypted with a new key, but they may have
            already seen them, so change those Riot passwords if you don’t trust them.
          </DialogDescription>
        </DialogHeader>
        {!canRotate && <p className="text-sm">Unlock your vault first so this browser can re-encrypt the shared logins.</p>}
        {needsRotation && canRotate && (
          <div className="text-sm">
            <p className="mb-2 text-muted-foreground">These members get the new key. Their fingerprints should match what they see on their vault page:</p>
            <ul className="grid gap-1">
              {stay.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span>{m.name ?? `Discord ${m.discordId}`}</span>
                  <code className="nums font-sans text-xs text-muted-foreground">{fps[m.id] ?? '…'}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep them</Button>
          </DialogClose>
          <Button variant="destructive" disabled={busy || !canRotate} onClick={remove}>
            {busy ? 'Re-encrypting…' : 'Remove member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
