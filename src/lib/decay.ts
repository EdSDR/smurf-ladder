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

/** How far back we look. Any bank older than this has fully drained, whatever it was. */
export const DECAY_WINDOW_DAYS = 28
const DAY = 86_400_000

/**
 * Replays ranked games to estimate today's bank, in days.
 * - Starts empty at the window's start (an older bank would have drained by now).
 * - Promotion into the current tier group starts a full bank.
 */
export function estimateBank(opts: { rules: DecayRules; games: number[]; enteredTierAt: number | null; now: number }): number {
  const { rules, now } = opts
  let t = now - DECAY_WINDOW_DAYS * DAY
  let bank = 0
  if (opts.enteredTierAt && opts.enteredTierAt > t) {
    t = opts.enteredTierAt
    bank = rules.cap
  }
  for (const g of [...opts.games].sort((a, b) => a - b)) {
    if (g < t || g > now) continue
    bank = Math.max(0, bank - (g - t) / DAY)
    bank = Math.min(rules.cap, bank + rules.perGame)
    t = g
  }
  return Math.max(0, bank - (now - t) / DAY)
}

/** The stored bank was computed at `asOf`; it keeps draining until the next refresh. */
export function bankNow(bank: number, asOf: number, now = Date.now()) {
  return Math.max(0, bank - (now - asOf) / DAY)
}

/**
 * An account that reached Master or higher stops decaying at Diamond II 75 LP. We know it reached
 * Master from the season peak we've recorded.
 */
export const APEX_FLOOR = { tier: 'DIAMOND', rank: 'II', lp: 75 } as const
const APEX_FLOOR_SCORE = rankScore(APEX_FLOOR.tier, APEX_FLOOR.rank, APEX_FLOOR.lp)

export function reachedApex(peakTier: string | null | undefined) {
  return !!peakTier && APEX.has(peakTier)
}

/** True when the account sits at (or below) its floor, so decay can't take anything more. */
export function atDecayFloor(tier: string | null | undefined, rank: string | null | undefined, lp: number, peakTier: string | null | undefined) {
  if (!reachedApex(peakTier) || !tier || APEX.has(tier)) return false
  return rankScore(tier, rank ?? null, lp) <= APEX_FLOOR_SCORE
}

export type DecayState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'floor' }
  | { kind: 'safe'; days: number; full: boolean; rules: DecayRules }
  | { kind: 'decaying'; rules: DecayRules }

export function decayState(
  tier: string | null | undefined,
  bank: number | null,
  asOf: number,
  pending: boolean,
  now = Date.now(),
  floor?: { rank: string | null | undefined; lp: number; peakTier: string | null | undefined },
): DecayState {
  const rules = decayRules(tier)
  if (!rules) return { kind: 'none' }
  if (floor && atDecayFloor(tier, floor.rank, floor.lp, floor.peakTier)) return { kind: 'floor' }
  if (pending || bank === null) return { kind: 'pending' }
  const left = bankNow(bank, asOf, now)
  if (left < 1) return { kind: 'decaying', rules }
  return { kind: 'safe', days: Math.floor(left), full: left > rules.cap - 1, rules }
}

/** Flag accounts that will start losing LP within this many days. */
export const DECAY_SOON_DAYS = 3

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
export function nextDecayDrop(tier: string | null | undefined, rank: string | null | undefined, lp: number, peakTier?: string | null): DecayDrop | null {
  const rules = decayRules(tier)
  if (!rules) return null
  if (atDecayFloor(tier, rank, lp, peakTier)) return null
  const days = Math.max(1, Math.ceil(lp / rules.lpPerDay))
  if (rules.group === 'apex') return { tier: 'DIAMOND', rank: 'II', days, approxLp: 75 }
  // Accounts that reached Master stop at Diamond II 75 LP instead of falling further.
  if (reachedApex(peakTier)) {
    if (rank === 'II') return { tier: 'DIAMOND', rank: 'II', days: 1, approxLp: APEX_FLOOR.lp }
    if (rank === 'I') return { tier: 'DIAMOND', rank: 'II', days, approxLp: APEX_FLOOR.lp }
  }
  const next = DIVISIONS_DOWN[rank ?? 'IV'] ?? DIVISIONS_DOWN.IV
  return { ...next, days, approxLp: null }
}
