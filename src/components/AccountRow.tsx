import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { MemberAccount, PublicAccount } from '#/server/accounts.functions'
import { TIER_META, formatRank, isTier, winrate } from '#/lib/tiers'
import { cn } from '#/lib/utils'
import { CredentialDialog } from './CredentialDialog'
import { DecayText } from './DecayText'
import type { Queue } from './Ladder'
import { ProfileIcon, TierMark } from './TierMark'

export type Row = PublicAccount & Partial<Omit<MemberAccount, keyof PublicAccount>>

export function RankText({ tier, rank, lp, className }: { tier: string | null; rank: string | null; lp?: number; className?: string }) {
  const color = isTier(tier) ? TIER_META[tier].color : 'var(--muted-ink)'
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <TierMark tier={tier} />
      <span className="wide truncate font-bold" style={{ color }}>
        {formatRank(tier, rank)}
      </span>
      {lp !== undefined && isTier(tier) && <span className="nums text-muted-foreground">{lp} LP</span>}
    </span>
  )
}

function Winrate({ wins, losses }: { wins: number; losses: number }) {
  const wr = winrate(wins, losses)
  if (wr === null) return <span className="text-sm text-muted-foreground">No games yet</span>
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="nums font-semibold">{wr}%</span>
        <span className="nums text-xs text-muted-foreground">
          {wins}W {losses}L
        </span>
      </div>
      <div className="h-1 w-full max-w-28 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-bone" style={{ width: `${wr}%` }} />
      </div>
    </div>
  )
}

function InGame() {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <span className="size-2 rounded-full" style={{ background: 'var(--tier-emerald)' }} aria-hidden />
      In game
    </span>
  )
}

export function AccountRow({ account, queue, meId }: { account: Row; queue: Queue; meId?: number }) {
  const q = account[queue]
  const isMember = meId !== undefined
  const riotId = `${account.gameName}#${account.tagLine}`
  const canSeeLogin = isMember && account.hasCredentials && (account.shared || account.ownerId === meId)

  return (
    <li
      id={`account-${account.id}`}
      style={{ '--actions-w': isMember ? '7rem' : '0px' } as React.CSSProperties}
      className="grid scroll-mt-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b px-1 py-3 target:bg-panel md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_var(--actions-w)] md:gap-x-5"
    >
      <ProfileIcon iconId={account.iconId} />
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {account.gameName}
          <span className="font-normal text-muted-foreground">#{account.tagLine}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {account.level ? `Level ${account.level}` : 'Level unknown'}
          {account.ownerName && `, added by ${account.ownerName}`}
          {isMember && !account.shared && account.hasCredentials && ', private login'}
        </div>
      </div>

      <div className="col-start-2 row-start-2 md:col-start-auto md:row-start-auto">
        <RankText tier={q?.tier ?? null} rank={q?.rank ?? null} lp={q?.lp} />
      </div>

      <div className="hidden md:block">{q ? <Winrate wins={q.wins} losses={q.losses} /> : <span className="text-sm text-muted-foreground">Not placed</span>}</div>

      <div className="col-span-2 col-start-2 row-start-3 flex flex-wrap items-center gap-x-4 gap-y-1 md:col-span-1 md:col-start-auto md:row-start-auto md:grid md:gap-1">
        {account.inGame && <InGame />}
        <DecayText q={q} queue={queue} refreshedAt={account.refreshedAt} />
      </div>

      <div className="col-start-3 row-span-2 row-start-1 flex items-center justify-end gap-1.5 md:col-start-auto md:row-span-1 md:row-start-auto">
        {canSeeLogin && <CredentialDialog accountId={account.id} riotId={riotId} />}
        {isMember && (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/accounts/$id" params={{ id: String(account.id) }} aria-label={`Details for ${riotId}`}>
              <ChevronRightIcon />
            </Link>
          </Button>
        )}
      </div>
    </li>
  )
}
