import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useVault } from '#/vault/VaultProvider'

export function RememberDevice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[var(--bone)]" />
      <span>Remember on this device. Your key stays in this browser and can't be copied out of it. It locks again after 3 days without using the site.</span>
    </label>
  )
}

export function UnlockForm({ onUnlocked }: { onUnlocked?: () => void }) {
  const vault = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await vault.unlock(passphrase, remember)
          onUnlocked?.()
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="unlock-passphrase">Vault passphrase</Label>
        <Input
          id="unlock-passphrase"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-invalid={!!error}
          autoFocus
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <RememberDevice checked={remember} onChange={setRemember} />
      <Button type="submit" disabled={busy || !passphrase}>
        {busy ? 'Unlocking…' : 'Unlock vault'}
      </Button>
    </form>
  )
}
