import { TriangleAlertIcon } from 'lucide-react'
import { DECAY_SOON_DAYS, DECAY_WINDOW_DAYS, decayState } from '#/lib/decay'
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
}: {
  q: QueueRank | null
  queue: 'solo' | 'flex'
  refreshedAt: number
  className?: string
  detailed?: boolean
}) {
  const state = decayState(q?.tier, q?.bank ?? null, refreshedAt, q?.decayPending ?? false)
  const base = cn('flex items-center gap-1 text-xs', className)

  if (state.kind === 'none') return detailed ? <span className={cn(base, 'text-muted-foreground')}>No decay below Diamond</span> : null
  if (state.kind === 'pending') return <span className={cn(base, 'text-muted-foreground')}>Checking decay…</span>

  const { rules } = state
  const how = `Estimated from ${queueName[queue]} games in the last ${DECAY_WINDOW_DAYS} days. Each game adds ${rules.perGame} ${rules.perGame === 1 ? 'day' : 'days'}, up to ${rules.cap}. The client shows the exact number.`

  if (state.kind === 'decaying') {
    return (
      <span className={cn(base, 'font-semibold text-foreground')} title={how}>
        <TriangleAlertIcon className="size-3.5" style={{ color: 'var(--tier-grandmaster)' }} aria-hidden />
        Decaying, −{rules.lpPerDay} LP a day
      </span>
    )
  }

  const soon = state.days <= DECAY_SOON_DAYS
  return (
    <span className={cn(base, soon ? 'font-semibold text-foreground' : 'text-muted-foreground')} title={how}>
      {soon && <TriangleAlertIcon className="size-3.5" style={{ color: 'var(--tier-gold)' }} aria-hidden />}
      Decays in {state.days} {state.days === 1 ? 'day' : 'days'}
      {detailed && (
        <span className="font-normal text-muted-foreground">
          , {state.full ? 'bank full' : `about ${state.days} of ${rules.cap} days banked`}
        </span>
      )}
    </span>
  )
}

export function decaysSoon(q: QueueRank | null, refreshedAt: number) {
  const s = decayState(q?.tier, q?.bank ?? null, refreshedAt, q?.decayPending ?? false)
  return s.kind === 'decaying' || (s.kind === 'safe' && s.days <= DECAY_SOON_DAYS)
}
