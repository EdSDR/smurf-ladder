import { Link } from '@tanstack/react-router'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '#/components/ui/dialog'
import { getCredential } from '#/server/accounts.functions'
import type { Credential } from '#/vault/crypto'
import { useVault } from '#/vault/VaultProvider'
import { UnlockForm } from './UnlockForm'

export function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret)
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-md border bg-rift px-3 py-1.5">
        <code className="min-w-0 flex-1 truncate font-sans text-sm">{shown ? value : '•'.repeat(Math.min(value.length, 14))}</code>
        {secret && (
          <Button variant="ghost" size="icon-sm" onClick={() => setShown((s) => !s)} aria-label={shown ? `Hide ${label}` : `Show ${label}`}>
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  )
}

/** Decrypts in the browser; the server only hands over ciphertext the member is allowed to see. */
export function CredentialView({ accountId }: { accountId: number }) {
  const vault = useVault()
  const [cred, setCred] = useState<Credential | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (vault.status !== 'unlocked') return
    let cancelled = false
    setError(null)
    getCredential({ data: { accountId } })
      .then((sealed) => {
        if (!sealed) throw new Error('No login saved for this account yet.')
        return vault.open(sealed)
      })
      .then((c) => !cancelled && setCred(c))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [accountId, vault.status, vault.groupKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (vault.status === 'no-vault') {
    return (
      <p className="text-sm text-muted-foreground">
        Logins are end-to-end encrypted.{' '}
        <Link to="/vault" className="text-foreground underline underline-offset-4">
          Set up your vault
        </Link>{' '}
        to see them.
      </p>
    )
  }
  if (vault.status === 'locked') return <UnlockForm />
  if (vault.status !== 'unlocked') return <p className="text-sm text-muted-foreground">Opening vault…</p>
  if (vault.groupAlert === 'mismatch') {
    return (
      <p className="text-sm text-muted-foreground">
        Shared logins are blocked on this browser: the group key changed unexpectedly.{' '}
        <Link to="/vault" className="text-foreground underline underline-offset-4">
          Check it on the vault page
        </Link>
        .
      </p>
    )
  }
  if (error) return <p className="text-sm text-muted-foreground">{error}</p>
  if (!cred) return <p className="text-sm text-muted-foreground">Decrypting…</p>
  return (
    <div className="grid gap-3">
      {cred.login && <CopyField label="Login" value={cred.login} />}
      {cred.password && <CopyField label="Password" value={cred.password} secret />}
      {cred.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{cred.note}</p>}
    </div>
  )
}

export function CredentialDialog({ accountId, riotId }: { accountId: number; riotId: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Show login for ${riotId}`}>
          <KeyRoundIcon />
          <span className="hidden lg:inline">Login</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Login for {riotId}</DialogTitle>
          <DialogDescription>Decrypted in your browser. Nothing readable leaves it.</DialogDescription>
        </DialogHeader>
        <CredentialView accountId={accountId} />
      </DialogContent>
    </Dialog>
  )
}
