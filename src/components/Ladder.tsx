import { useMemo } from 'react'
import type { PublicAccount } from '#/server/accounts.functions'
import { TIERS, TIER_META, formatRank, rankScore, tierIndex } from '#/lib/tiers'
import { cn } from '#/lib/utils'

export type Queue = 'solo' | 'flex'
export const UNRANKED = 'UNRANKED'
const STEPS = [UNRANKED, ...TIERS] as const

type Props = {
  accounts: PublicAccount[]
  queue: Queue
  selected: string[]
  onToggle: (tier: string) => void
}

/**
 * The hero: a staircase from Unranked to Challenger. Each step rises with the tier,
 * and every account is a pin standing on its step.
 */
export function Ladder({ accounts, queue, selected, onToggle }: Props) {
  const byStep = useMemo(() => {
    const map = new Map<string, PublicAccount[]>(STEPS.map((s) => [s, []]))
    for (const a of accounts) {
      const q = a[queue]
      map.get(q && tierIndex(q.tier) >= 0 ? q.tier : UNRANKED)!.push(a)
    }
    for (const list of map.values()) {
      list.sort((x, y) => rankScore(x[queue]?.tier ?? null, x[queue]?.rank ?? null, x[queue]?.lp ?? null) - rankScore(y[queue]?.tier ?? null, y[queue]?.rank ?? null, y[queue]?.lp ?? null))
    }
    return map
  }, [accounts, queue])

  let pinIndex = 0
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <ol className="grid min-w-[900px] grid-cols-11 items-end gap-1.5" aria-label="Accounts by tier">
        {STEPS.map((step, i) => {
          const list = byStep.get(step)!
          const isTierStep = step !== UNRANKED
          const color = isTierStep ? TIER_META[step].color : 'var(--muted-ink)'
          const active = selected.includes(step)
          const dimmed = selected.length > 0 && !active
          const label = isTierStep ? TIER_META[step].short : 'Unranked'
          return (
            <li key={step} className={cn('flex flex-col justify-end transition-opacity', dimmed && 'opacity-40')}>
              <div className="flex min-h-6 flex-wrap-reverse content-start justify-center gap-1 px-1 pb-1.5">
                {list.map((a) => {
                  const q = a[queue]
                  const delay = pinIndex++ * 35
                  return (
                    <a
                      key={a.id}
                      href={`#account-${a.id}`}
                      title={`${a.gameName}#${a.tagLine}, ${formatRank(q?.tier ?? null, q?.rank ?? null)}${q ? ` ${q.lp} LP` : ''}`}
                      aria-label={`${a.gameName}#${a.tagLine}, ${formatRank(q?.tier ?? null, q?.rank ?? null)}`}
                      className="pin-drop group grid size-4 place-items-center rounded-sm"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      <span
                        className={cn(
                          'block size-2.5 rotate-45 transition-transform group-hover:scale-150',
                          a.inGame && 'ring-2 ring-bone ring-offset-1 ring-offset-rift',
                        )}
                        style={{ background: isTierStep ? color : 'transparent', border: isTierStep ? undefined : `1.5px solid ${color}` }}
                      />
                    </a>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => onToggle(step)}
                aria-pressed={active}
                aria-label={`${isTierStep ? TIER_META[step].name : 'Unranked'}: ${list.length} ${list.length === 1 ? 'account' : 'accounts'}`}
                className={cn(
                  'group relative flex flex-col justify-between rounded-t-md border-t-[3px] px-2 pt-1.5 pb-2 text-left transition-colors',
                  'hover:brightness-125 focus-visible:outline-offset-[-2px]',
                )}
                style={{
                  height: 60 + i * 15,
                  borderColor: color,
                  background: `color-mix(in oklab, ${color} ${active ? 30 : 12}%, var(--rift))`,
                }}
              >
                <span className="nums text-lg leading-none font-semibold" style={{ color }}>
                  {list.length || ''}
                </span>
                <span className="wide truncate text-xs font-extrabold" style={{ color: isTierStep ? color : 'var(--muted-ink)' }}>
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
