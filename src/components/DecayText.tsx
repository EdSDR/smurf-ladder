import { TriangleAlertIcon } from 'lucide-react'
import { APEX_FLOOR, DECAY_SOON_MS, DECAY_WINDOW_DAYS, decayState, nextDecayDrop, reachedApex } from '#/lib/decay'
import { formatRank } from '#/lib/tiers'
import type { QueueRank } from '#/server/accounts.functions'
import { cn } from '#/lib/utils'

const queueName = { solo: 'Solo/Duo', flex: 'Flex' } as const
const HOUR = 3_600_000

/** "13h", "1 day 9h", "5 days". */
function timeLeft(ms: number) {
  if (ms < HOUR) return 'under an hour'
  const hours = Math.floor(ms / HOUR)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  const d = `${days} ${days === 1 ? 'day' : 'days'}`
  return days < 3 && rest ? `${d} ${rest}h` : d
}

// Riot's schedule is Brasília time; pinning the zone also keeps server and browser renders equal.
const zone = { timeZone: 'America/Sao_Paulo' } as const
/** "Mon at 23:45" */
const checkTime = (t: number) =>
  `${new Date(t).toLocaleString('en', { weekday: 'short', ...zone })} at ${new Date(t).toLocaleString('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zone })}`

/** Reached Master this season: seen in the peak we recorded, or inferred from holding at the floor. */
const reachedMaster = (q: QueueRank | null, peakTier: string | null | undefined) => reachedApex(peakTier) || !!q?.heldFloor

function stateOf(q: QueueRank | null, refreshedAt: number, peakTier: string | null | undefined) {
  return decayState(q?.tier, q?.bank ?? null, refreshedAt, q?.decayPending ?? false, Date.now(), q ? { rank: q.rank, lp: q.lp, reachedMaster: reachedMaster(q, peakTier) } : undefined)
}

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
  const state = stateOf(q, refreshedAt, peakTier)
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
  const drop = q ? nextDecayDrop(q.tier, q.rank, q.lp, reachedMaster(q, peakTier)) : null
  const landing = drop ? `${formatRank(drop.tier, drop.rank)}${drop.approxLp ? ` (about ${drop.approxLp} LP)` : ''}` : null
  const how = `Estimated from ${queueName[queue]} games in the last ${DECAY_WINDOW_DAYS} days. Each game adds ${rules.perGame} ${rules.perGame === 1 ? 'day' : 'days'}, up to ${rules.cap}. Riot checks decay every day at 23:45 Brasília time and uses one banked day; the check that empties the bank, and each one after it, takes ${rules.lpPerDay} LP${landing ? ` until it falls to ${landing}` : ''}. The client shows the exact number.`

  if (state.kind === 'decaying') {
    return (
      <span className={cn(base, 'font-semibold text-foreground')} title={how}>
        <TriangleAlertIcon className={cn('size-3.5 shrink-0', detailed && 'mt-0.5')} style={{ color: 'var(--tier-grandmaster)' }} aria-hidden />
        <span>
          Decaying −{rules.lpPerDay} LP/day
          {detailed && (
            <span className="block font-normal text-muted-foreground">
              Next LP loss {checkTime(state.nextLossAt)}, in {timeLeft(state.nextLossAt - Date.now())}.
              {drop && ` Drops to ${landing} in ${drop.days} ${drop.days === 1 ? 'day' : 'days'} without a ranked game.`}
            </span>
          )}
        </span>
      </span>
    )
  }

  const soon = state.msLeft <= DECAY_SOON_MS
  return (
    <span className={cn(base, soon ? 'font-semibold text-foreground' : 'text-muted-foreground')} title={how}>
      {soon && <TriangleAlertIcon className={cn('size-3.5 shrink-0', detailed && 'mt-0.5')} style={{ color: 'var(--tier-gold)' }} aria-hidden />}
      <span>
        {`Decays in ${timeLeft(state.msLeft)}`}
        {detailed && <span className="font-normal text-muted-foreground">{state.full ? ', bank full' : `, ${state.days} of ${rules.cap} days banked`}</span>}
        {detailed && (
          <span className="block font-normal text-muted-foreground">
            First LP loss {checkTime(state.firstLossAt)} without a ranked game.
            {drop && ` After that it loses ${rules.lpPerDay} LP a day and falls to ${landing} after ${drop.days} ${drop.days === 1 ? 'day' : 'days'}.`}
          </span>
        )}
      </span>
    </span>
  )
}

export function decaysSoon(q: QueueRank | null, refreshedAt: number, peakTier?: string | null) {
  const s = stateOf(q, refreshedAt, peakTier)
  return s.kind === 'decaying' || (s.kind === 'safe' && s.msLeft <= DECAY_SOON_MS)
}
