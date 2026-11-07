import { Link, useRouter } from '@tanstack/react-router'
import { LockIcon, LockOpenIcon, PlusIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { signOut, type Me } from '#/server/auth.functions'
import { useVault } from '#/vault/VaultProvider'
import { cn } from '#/lib/utils'

const navLink = 'rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
const navActive = { className: 'text-foreground font-semibold' }

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Smurf Ladder, home">
      <svg viewBox="0 0 24 20" className="h-5 w-6" aria-hidden>
        <rect x="0" y="14" width="6" height="6" fill="var(--tier-bronze)" />
        <rect x="9" y="8" width="6" height="12" fill="var(--tier-gold)" />
        <rect x="18" y="2" width="6" height="18" fill="var(--tier-master)" />
      </svg>
      <span className="wide text-lg font-extrabold tracking-tight">Smurf Ladder</span>
    </Link>
  )
}

export function SiteHeader({ me }: { me: Me | null }) {
  const router = useRouter()
  const vault = useVault()

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Wordmark />
        {me && (
          <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Main">
            <Link to="/" className={navLink} activeProps={navActive} activeOptions={{ exact: true, includeSearch: false }}>
              All accounts
            </Link>
            <Link to="/mine" className={navLink} activeProps={navActive}>
              Added by me
            </Link>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <>
              <Button asChild size="sm">
                <Link to="/add">
                  <PlusIcon />
                  Add account
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-2 rounded-full p-0.5" aria-label="Account menu">
                    {me.avatar ? (
                      <img src={me.avatar} alt="" className="size-8 rounded-full" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full bg-panel-raised text-sm font-semibold">
                        {(me.name ?? '?').slice(0, 1)}
                      </span>
                    )}
                    <span
                      className={cn('-ml-3 mt-5 grid size-4 place-items-center rounded-full bg-rift', vault.status === 'unlocked' ? 'text-foreground' : 'text-muted-foreground')}
                      title={vault.status === 'unlocked' ? 'Vault unlocked' : 'Vault locked'}
                    >
                      {vault.status === 'unlocked' ? <LockOpenIcon className="size-3" /> : <LockIcon className="size-3" />}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5 text-sm font-semibold">{me.name}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link to="/mine">Added by me</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/vault">{vault.status === 'unlocked' ? 'Vault' : vault.status === 'no-vault' ? 'Set up vault' : 'Unlock vault'}</Link>
                  </DropdownMenuItem>
                  {vault.status === 'unlocked' && <DropdownMenuItem onSelect={() => vault.lock()}>Lock vault</DropdownMenuItem>}
                  {me.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">Members</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={async () => {
                      await vault.lock()
                      await signOut()
                      await router.invalidate()
                      router.navigate({ to: '/' })
                    }}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild size="sm" variant="outline">
              <a href="/auth/discord">Sign in with Discord</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
