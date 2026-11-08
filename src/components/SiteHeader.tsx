import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { LockIcon, LockOpenIcon, MenuIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { signOut, type Me } from '#/server/auth.functions'
import { searchIndex } from '#/server/members.functions'
import { useVault } from '#/vault/VaultProvider'
import { formatRank } from '#/lib/tiers'
import { cn } from '#/lib/utils'
import { TierCrest } from './game/GameArt'

/** Active items get a bone underline that sits on the header's bottom border. */
const navLink =
  'relative flex h-14 items-center px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent'
const navActive = { className: 'text-foreground after:bg-bone' }

function Wordmark() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Smurf Ladder, home">
      <svg viewBox="0 0 24 20" className="h-5 w-6" aria-hidden>
        <rect x="0" y="14" width="6" height="6" fill="var(--tier-bronze)" />
        <rect x="9" y="8" width="6" height="12" fill="var(--tier-gold)" />
        <rect x="18" y="2" width="6" height="18" fill="var(--tier-master)" />
      </svg>
      <span className="wide hidden text-lg font-extrabold tracking-tight sm:inline">Smurf Ladder</span>
    </Link>
  )
}

const NAV = [
  { to: '/', label: 'Leaderboard', exact: true },
  { to: '/members', label: 'Members', exact: false },
  { to: '/best', label: 'Best games', exact: false },
] as const

type Index = Awaited<ReturnType<typeof searchIndex>>

/** ⌘K search across tracked accounts and members. Loads its index the first time it opens. */
function Search() {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState<Index | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open && !index) searchIndex().then(setIndex).catch(() => setIndex({ accounts: [], members: [] }))
  }, [open, index])

  const go = (to: () => void) => {
    setOpen(false)
    to()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border bg-panel px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground lg:w-64"
        aria-label="Search accounts or members"
      >
        <SearchIcon className="size-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="ml-auto hidden rounded border bg-rift px-1.5 font-sans text-[11px] lg:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find an account or a member">
        <CommandInput placeholder="Riot ID or member name" />
        <CommandList>
          <CommandEmpty>{index ? 'Nothing matches that.' : 'Loading…'}</CommandEmpty>
          {index && index.accounts.length > 0 && (
            <CommandGroup heading="Accounts">
              {index.accounts.map((a) => (
                <CommandItem
                  key={`a${a.id}`}
                  value={`${a.gameName}#${a.tagLine}`}
                  onSelect={() => go(() => navigate({ to: '/accounts/$id', params: { id: String(a.id) } }))}
                >
                  <TierCrest tier={a.tier} className="size-5" />
                  <span className="truncate">
                    {a.gameName}
                    <span className="text-muted-foreground">#{a.tagLine}</span>
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatRank(a.tier, a.rank)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {index && index.members.length > 0 && (
            <CommandGroup heading="Members">
              {index.members.map((m) => (
                <CommandItem key={`m${m.id}`} value={`member ${m.name ?? m.id}`} onSelect={() => go(() => navigate({ to: '/members/$id', params: { id: String(m.id) } }))}>
                  {m.avatar ? <img src={m.avatar} alt="" className="size-5 rounded-full" /> : <span className="size-5 rounded-full bg-panel-raised" />}
                  <span className="truncate">{m.name ?? 'Unnamed member'}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}

export function SiteHeader({ me }: { me: Me | null }) {
  const router = useRouter()
  const vault = useVault()

  return (
    <header className="sticky top-0 z-30 border-b bg-rift/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Wordmark />
        <nav className="ml-4 hidden items-stretch md:flex" aria-label="Main">
          {NAV.filter((n) => me || n.to === '/').map((n) => (
            <Link key={n.to} to={n.to} className={navLink} activeProps={navActive} activeOptions={{ exact: n.exact, includeSearch: false }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <>
              <Search />
              <Button asChild size="lg" className="hidden px-3 sm:inline-flex">
                <Link to="/add">
                  <PlusIcon />
                  Add account
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="relative flex items-center rounded-full p-0.5" aria-label="Account menu">
                    {me.avatar ? (
                      <img src={me.avatar} alt="" className="size-8 rounded-full" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-full bg-panel-raised text-sm font-semibold">{(me.name ?? '?').slice(0, 1)}</span>
                    )}
                    <span
                      className={cn('absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-rift', vault.status === 'unlocked' ? 'text-foreground' : 'text-muted-foreground')}
                      title={vault.status === 'unlocked' ? 'Vault unlocked' : 'Vault locked'}
                    >
                      {vault.status === 'unlocked' ? <LockOpenIcon className="size-3" /> : <LockIcon className="size-3" />}
                    </span>
                    <MenuIcon className="ml-1 size-4 text-muted-foreground md:hidden" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-sm font-semibold">{me.name}</div>
                  <DropdownMenuSeparator />
                  <div className="md:hidden">
                    {NAV.map((n) => (
                      <DropdownMenuItem key={n.to} asChild>
                        <Link to={n.to}>{n.label}</Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem asChild className="sm:hidden">
                      <Link to="/add">Add account</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>
                  <DropdownMenuItem asChild>
                    <Link to="/members/$id" params={{ id: String(me.id) }}>
                      Your profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/vault">{vault.status === 'unlocked' ? 'Vault' : vault.status === 'no-vault' ? 'Set up vault' : 'Unlock vault'}</Link>
                  </DropdownMenuItem>
                  {vault.status === 'unlocked' && <DropdownMenuItem onSelect={() => vault.lock()}>Lock vault</DropdownMenuItem>}
                  {me.role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin">Manage members</Link>
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
