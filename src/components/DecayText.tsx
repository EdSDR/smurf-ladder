import { TriangleAlertIcon } from 'lucide-react'
import { APEX_FLOOR, DECAY_SOON_DAYS, DECAY_WINDOW_DAYS, decayState, nextDecayDrop } from '#/lib/decay'
import { formatRank } from '#/lib/tiers'
import type { QueueRank } from '#/server/accounts.functions'
import { cn } from '#/lib/utils'

const queueName = { solo: 'Solo/Duo', flex: 'Flex' } as const

/** "Decays in 9 days", estimated from recent ranked games (Riot's API doesn't expose the bank). */
export function DecayText({
  q,
  queue,
  refreshedAt,
  className,
  detailed = false,
  peakTier,
}: {
  q: QueueRank | null
  queue: 'solo' | 'flex'
  refreshedAt: number
  className?: string
  detailed?: boolean
  /** The account's season peak; reaching Master puts its decay floor at Diamond II 75 LP. */
  peakTier?: string | null
}) {
  const state = decayState(q?.tier, q?.bank ?? null, refreshedAt, q?.decayPending ?? false, Date.now(), q ? { rank: q.rank, lp: q.lp, peakTier } : undefined)
  const base = cn('flex gap-1 text-xs', detailed ? 'items-start' : 'items-center whitespace-nowrap', className)

  if (state.kind === 'none') return detailed ? <span className={cn(base, 'text-muted-foreground')}>No decay below Diamond</span> : null
  if (state.kind === 'pending') return <span className={cn(base, 'text-muted-foreground')}>Checking decay…</span>
  if (state.kind === 'floor') {
    const floor = `${formatRank(APEX_FLOOR.tier, APEX_FLOOR.rank)} ${APEX_FLOOR.lp} LP`
    return (
      <span className={cn(base, 'text-muted-foreground')} title="Accounts that reached Master this season stop decaying at Diamond II 75 LP.">
        {detailed ? `Won't decay past ${floor}. It reached Master this season, so this is its floor.` : `Won't decay past ${floor}`}
      </span>
    )
  }

  const { rules } = state
  const drop = q ? nextDecayDrop(q.tier, q.rank, q.lp, peakTier) : null
  const landing = drop ? `${formatRank(drop.tier, drop.rank)}${drop.approxLp ? ` (about ${drop.approxLp} LP)` : ''}` : null
  const how = `Estimated from ${queueName[queue]} games in the last ${DECAY_WINDOW_DAYS} days. Each game adds ${rules.perGame} ${rules.perGame === 1 ? 'day' : 'days'}, up to ${rules.cap}. Once the bank is empty it loses ${rules.lpPerDay} LP a day${landing ? ` and falls to ${landing}` : ''}. The client shows the exact number.`

  if (state.kind === 'decaying') {
    return (
      <span className={cn(base, 'font-semibold text-foreground')} title={how}>
        <TriangleAlertIcon className={cn('size-3.5 shrink-0', detailed && 'mt-0.5')} style={{ color: 'var(--tier-grandmaster)' }} aria-hidden />
        <span>
          Decaying −{rules.lpPerDay} LP/day
          {detailed && drop && (
            <span className="block font-normal text-muted-foreground">
              Drops to {landing} in {drop.days} {drop.days === 1 ? 'day' : 'days'} without a ranked game.
            </span>
          )}
        </span>
      </span>
    )
  }

  const soon = state.days <= DECAY_SOON_DAYS
  return (
    <span className={cn(base, soon ? 'font-semibold text-foreground' : 'text-muted-foreground')} title={how}>
      {soon && <TriangleAlertIcon className={cn('size-3.5 shrink-0', detailed && 'mt-0.5')} style={{ color: 'var(--tier-gold)' }} aria-hidden />}
      <span>
        {`Decays in ${state.days} ${state.days === 1 ? 'day' : 'days'}`}
        {detailed && <span className="font-normal text-muted-foreground">{state.full ? ', bank full' : `, about ${state.days} of ${rules.cap} days banked`}</span>}
        {detailed && drop && (
          <span className="block font-normal text-muted-foreground">
            After that it loses {rules.lpPerDay} LP a day and falls to {landing} after {drop.days} {drop.days === 1 ? 'day' : 'days'}.
          </span>
        )}
      </span>
    </span>
  )
}

export function decaysSoon(q: QueueRank | null, refreshedAt: number, peakTier?: string | null) {
  const s = decayState(q?.tier, q?.bank ?? null, refreshedAt, q?.decayPending ?? false, Date.now(), q ? { rank: q.rank, lp: q.lp, peakTier } : undefined)
  return s.kind === 'decaying' || (s.kind === 'safe' && s.days <= DECAY_SOON_DAYS)
}
