import { APEX } from './tiers'

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

export type DecayState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'safe'; days: number; full: boolean; rules: DecayRules }
  | { kind: 'decaying'; rules: DecayRules }

export function decayState(tier: string | null | undefined, bank: number | null, asOf: number, pending: boolean, now = Date.now()): DecayState {
  const rules = decayRules(tier)
  if (!rules) return { kind: 'none' }
  if (pending || bank === null) return { kind: 'pending' }
  const left = bankNow(bank, asOf, now)
  if (left < 1) return { kind: 'decaying', rules }
  return { kind: 'safe', days: Math.floor(left), full: left > rules.cap - 1, rules }
}

/** Flag accounts that will start losing LP within this many days. */
export const DECAY_SOON_DAYS = 3
