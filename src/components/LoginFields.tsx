import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Switch } from '#/components/ui/switch'

export function LoginFields({
  login,
  password,
  note,
  onChange,
}: {
  login: string
  password: string
  note: string
  onChange: (patch: Partial<{ login: string; password: string; note: string }>) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="login">Login username</Label>
        <Input id="login" autoComplete="off" value={login} onChange={(e) => onChange({ login: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => onChange({ password: e.target.value })} />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" placeholder="Email on the account, 2FA, anything else" value={note} onChange={(e) => onChange({ note: e.target.value })} />
      </div>
    </div>
  )
}

export function ShareSwitch({ shared, onChange, disabledReason }: { shared: boolean; onChange: (v: boolean) => void; disabledReason?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id="shared" checked={shared} onCheckedChange={onChange} disabled={!!disabledReason && !shared} className="mt-0.5" />
      <div>
        <Label htmlFor="shared">Share login with all members</Label>
        <p className="text-sm text-muted-foreground">
          {disabledReason ?? (shared ? 'Every member can see this login.' : 'Only you can see this login. Everyone still sees the rank.')}
        </p>
      </div>
    </div>
  )
}
