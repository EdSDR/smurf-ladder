import { APEX, rankScore } from './tiers'

/**
 * Riot's inactivity rules (support.riotgames.com, "Placements, Promotions, Series, Demotions,
 * and Decay"). Each ranked queue has its own bank: games add days up to a cap, and one day drains
 * every day. At zero, the account loses LP daily. Riot's API doesn't expose the bank, so we
 * rebuild it from the account's recent ranked games.
 */
export type DecayRules = { group: 'diamond' | 'apex'; cap: number; perGame: number; lpPerDay: number }

const DIAMOND: DecayRules = { group: 'diamond', cap: 28, perGame: 7, lpPerDay: 50 }
const APEX_RULES: DecayRules = { group: 'apex', cap: 14, perGame: 1, lpPerDay: 75 }

export function decayRules(tier: string | null | undefined): DecayRules | null {
  if (tier === 'DIAMOND') return DIAMOND
  if (tier && APEX.has(tier)) return APEX_RULES
  return null
}

/** How far back we list games when an account has none stored yet. */
export const DECAY_WINDOW_DAYS = 28
/**
 * How far back we replay games. The bank before that is unknown, so the replay starts it empty.
 * A short replay undercounts regular players (a Master bank carried over from earlier games), so
 * we replay everything stored from this far back; the estimate settles once the bank hits 0 or
 * the cap anywhere in that stretch.
 */
export const DECAY_REPLAY_DAYS = 90
const DAY = 86_400_000

/**
 * Riot runs decay once a day at 23:45 Brasília time (02:45 UTC; Brazil has no daylight saving).
 * Each check takes one day from the bank, and the check that empties it, and every one after,
 * costs LP. So a bank of 1 day means LP goes at the next check, not "already decaying".
 */
const CHECK_OFFSET = (2 * 60 + 45) * 60_000

/** The first decay check strictly after `t`. */
export function nextDecayCheck(t: number) {
  return (Math.floor((t - CHECK_OFFSET) / DAY) + 1) * DAY + CHECK_OFFSET
}

/** Decay checks in (from, to]. */
export function checksBetween(from: number, to: number) {
  if (to <= from) return 0
  return Math.floor((to - CHECK_OFFSET) / DAY) - Math.floor((from - CHECK_OFFSET) / DAY)
}

/** Whole days banked, and when the current run of LP losses began (null while the bank holds). */
export type Bank = { days: number; decayingSince: number | null }

/**
 * Replays ranked games and daily checks to estimate today's bank.
 * - Starts empty DECAY_REPLAY_DAYS ago.
 * - Promotion into the current tier group starts a full bank.
 */
export function estimateBank(opts: { rules: DecayRules; games: number[]; enteredTierAt: number | null; now: number }): Bank {
  const { rules, now } = opts
  let t = now - DECAY_REPLAY_DAYS * DAY
  let days = 0
  let decayingSince: number | null = null
  if (opts.enteredTierAt && opts.enteredTierAt > t) {
    t = opts.enteredTierAt
    days = rules.cap
  }
  const runChecks = (until: number) => {
    for (let c = nextDecayCheck(t); c <= until; c += DAY) {
      days = Math.max(0, days - 1)
      if (days === 0) decayingSince ??= c
    }
    t = until
  }
  for (const g of [...opts.games].sort((a, b) => a - b)) {
    if (g < t || g > now) continue
    runChecks(g)
    days = Math.min(rules.cap, days + rules.perGame)
    decayingSince = null
  }
  runChecks(now)
  return { days, decayingSince }
}

/** The stored bank was counted at `asOf`; each decay check since then took a day. */
export function bankNow(bank: number, asOf: number, now = Date.now()) {
  return Math.max(0, Math.floor(bank) - checksBetween(asOf, now))
}

/**
 * An account that reached Master or higher stops decaying at Diamond II 75 LP. We know it reached
 * Master from the season peak we've recorded, or because it held at Diamond II 75 LP through a
 * check that should have cost it LP (see heldAtFloor).
 */
export const APEX_FLOOR = { tier: 'DIAMOND', rank: 'II', lp: 75 } as const
const APEX_FLOOR_SCORE = rankScore(APEX_FLOOR.tier, APEX_FLOOR.rank, APEX_FLOOR.lp)

export function reachedApex(peakTier: string | null | undefined) {
  return !!peakTier && APEX.has(peakTier)
}

/** True when the account sits at (or below) its floor, so decay can't take anything more. */
export function atDecayFloor(tier: string | null | undefined, rank: string | null | undefined, lp: number, reachedMaster: boolean) {
  if (!reachedMaster || !tier || APEX.has(tier)) return false
  return rankScore(tier, rank ?? null, lp) <= APEX_FLOOR_SCORE
}

/** Riot can take a while to apply a check; only trust one that passed this long ago. */
const CHECK_GRACE = 3 * 60 * 60_000

/**
 * An account at exactly Diamond II 75 LP whose bank was empty at a check, and that still hasn't
 * moved since before that check, didn't lose LP when it should have: it's at its floor, so it
 * reached Master this season even if we never saw it there.
 */
export function heldAtFloor(q: { tier: string | null; rank: string | null; lp: number | null }, bank: Bank, unchangedSince: number, now: number) {
  if (q.tier !== APEX_FLOOR.tier || q.rank !== APEX_FLOOR.rank || q.lp !== APEX_FLOOR.lp || bank.decayingSince === null) return false
  const lastCheck = nextDecayCheck(now - CHECK_GRACE) - DAY
  return lastCheck >= bank.decayingSince && lastCheck > unchangedSince
}

export type DecayState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'floor' }
  | { kind: 'safe'; days: number; msLeft: number; firstLossAt: number; full: boolean; rules: DecayRules }
  | { kind: 'decaying'; nextLossAt: number; rules: DecayRules }

export function decayState(
  tier: string | null | undefined,
  bank: number | null,
  asOf: number,
  pending: boolean,
  now = Date.now(),
  floor?: { rank: string | null | undefined; lp: number; reachedMaster: boolean },
): DecayState {
  const rules = decayRules(tier)
  if (!rules) return { kind: 'none' }
  if (floor && atDecayFloor(tier, floor.rank, floor.lp, floor.reachedMaster)) return { kind: 'floor' }
  if (pending || bank === null) return { kind: 'pending' }
  const left = bankNow(bank, asOf, now)
  const next = nextDecayCheck(now)
  if (left < 1) return { kind: 'decaying', nextLossAt: next, rules }
  const firstLossAt = next + (left - 1) * DAY
  return { kind: 'safe', days: left, msLeft: firstLossAt - now, firstLossAt, full: left >= rules.cap, rules }
}

/** Flag accounts that will start losing LP within this many days. */
export const DECAY_SOON_DAYS = 3
export const DECAY_SOON_MS = DECAY_SOON_DAYS * DAY

/**
 * Where decay ends and how long it takes to get there, if the account keeps not playing.
 * - Master and up lose 75 LP a day and land in Diamond II. Riot gives no LP for the landing;
 *   it's usually around 75 (players report 25–75 depending on MMR).
 * - Diamond loses 50 LP a day and drops one division each time LP runs out. Diamond IV falls
 *   to Emerald I, where decay stops (Emerald and below don't decay).
 */
export type DecayDrop = { tier: string; rank: string | null; days: number; approxLp: number | null }

const DIVISIONS_DOWN: Record<string, { tier: string; rank: string }> = {
  I: { tier: 'DIAMOND', rank: 'II' },
  II: { tier: 'DIAMOND', rank: 'III' },
  III: { tier: 'DIAMOND', rank: 'IV' },
  IV: { tier: 'EMERALD', rank: 'I' },
}

/** Days of decay until the next drop (division or tier), counted from when LP starts falling. */
export function nextDecayDrop(tier: string | null | undefined, rank: string | null | undefined, lp: number, reachedMaster = false): DecayDrop | null {
  const rules = decayRules(tier)
  if (!rules) return null
  if (atDecayFloor(tier, rank, lp, reachedMaster)) return null
  const days = Math.max(1, Math.ceil(lp / rules.lpPerDay))
  if (rules.group === 'apex') return { tier: 'DIAMOND', rank: 'II', days, approxLp: 75 }
  // Accounts that reached Master stop at Diamond II 75 LP instead of falling further.
  if (reachedMaster) {
    if (rank === 'II') return { tier: 'DIAMOND', rank: 'II', days: 1, approxLp: APEX_FLOOR.lp }
    if (rank === 'I') return { tier: 'DIAMOND', rank: 'II', days, approxLp: APEX_FLOOR.lp }
  }
  const next = DIVISIONS_DOWN[rank ?? 'IV'] ?? DIVISIONS_DOWN.IV
  return { ...next, days, approxLp: null }
}
