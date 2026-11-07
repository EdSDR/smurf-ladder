import { Link, useRouter } from '@tanstack/react-router'
import { ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import type { MemberAccount, PublicAccount } from '#/server/accounts.functions'
import { setClaim } from '#/server/accounts.functions'
import { DECAY_WARN_DAYS, TIER_META, decayAtRisk, formatRank, isTier, winrate } from '#/lib/tiers'
import { daysSince } from '#/lib/time'
import { cn } from '#/lib/utils'
import { CredentialDialog } from './CredentialDialog'
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

function Status({ account, meId }: { account: Row; meId?: number }) {
  if (account.inGame) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ background: 'var(--tier-emerald)' }} aria-hidden />
        In game
      </span>
    )
  }
  if (account.claimedBy) {
    return (
      <span className="text-sm text-muted-foreground">
        {account.claimedBy.id === meId ? "You're on it" : `${account.claimedBy.name ?? 'A member'} is on it`}
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground">Free</span>
}

function LastRanked({ account, queue }: { account: Row; queue: Queue }) {
  const days = daysSince(account.lastRankedAt)
  const atRisk = decayAtRisk(account[queue]?.tier ?? null, account.lastRankedAt)
  if (days === null) return <span className="text-xs text-muted-foreground">No ranked games found</span>
  return (
    <span
      className={cn('flex items-center gap-1 text-xs', atRisk ? 'text-foreground' : 'text-muted-foreground')}
      title={atRisk ? `Diamond and above decay after inactivity. Flagged at ${DECAY_WARN_DAYS}+ days.` : undefined}
    >
      {atRisk && <TriangleAlertIcon className="size-3.5" style={{ color: 'var(--tier-gold)' }} aria-label="Decay risk" />}
      {days === 0 ? 'Ranked today' : `${days} ${days === 1 ? 'day' : 'days'} since ranked`}
    </span>
  )
}

export function AccountRow({ account, queue, meId }: { account: Row; queue: Queue; meId?: number }) {
  const router = useRouter()
  const q = account[queue]
  const isMember = meId !== undefined
  const riotId = `${account.gameName}#${account.tagLine}`
  const canSeeLogin = isMember && account.hasCredentials && (account.shared || account.ownerId === meId)
  const mine = account.claimedBy?.id === meId

  return (
    <li
      id={`account-${account.id}`}
      style={{ '--actions-w': isMember ? '11rem' : '0px' } as React.CSSProperties}
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
        <Status account={account} meId={meId} />
        <LastRanked account={account} queue={queue} />
      </div>

      <div className="col-start-3 row-span-2 row-start-1 flex items-center justify-end gap-1.5 md:col-start-auto md:row-span-1 md:row-start-auto">
        {isMember && !account.inGame && (!account.claimedBy || mine) && (
          <Button
            variant={mine ? 'secondary' : 'ghost'}
            size="sm"
            className="hidden sm:inline-flex"
            onClick={async () => {
              try {
                await setClaim({ data: { accountId: account.id, claim: !mine } })
                toast.success(mine ? `Released ${riotId}` : `You're on ${riotId}`)
                router.invalidate()
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          >
            {mine ? 'Release' : "I'm on it"}
          </Button>
        )}
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
