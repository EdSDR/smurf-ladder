import type { Account } from '#/db/schema'
import type { LeagueEntry } from './riot'

type QueueState = { tier: string | null; rank: string | null; lp: number | null; wins: number | null; losses: number | null }

export function queueState(a: Account, queue: 'solo' | 'flex'): QueueState {
  return queue === 'solo'
    ? { tier: a.soloTier, rank: a.soloRank, lp: a.soloLp, wins: a.soloWins, losses: a.soloLosses }
    : { tier: a.flexTier, rank: a.flexRank, lp: a.flexLp, wins: a.flexWins, losses: a.flexLosses }
}

/** A snapshot is worth storing only when a game was played or the rank moved. */
export function rankChanged(prev: QueueState, next: LeagueEntry | null): boolean {
  if (!next) return false
  return (
    prev.tier !== next.tier ||
    prev.rank !== next.rank ||
    prev.lp !== next.leaguePoints ||
    prev.wins !== next.wins ||
    prev.losses !== next.losses
  )
}
