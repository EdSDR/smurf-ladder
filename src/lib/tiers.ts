export const TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
] as const

export type Tier = (typeof TIERS)[number]

export const TIER_META: Record<Tier, { name: string; short: string; color: string }> = {
  IRON: { name: 'Iron', short: 'Iron', color: 'var(--tier-iron)' },
  BRONZE: { name: 'Bronze', short: 'Bronze', color: 'var(--tier-bronze)' },
  SILVER: { name: 'Silver', short: 'Silver', color: 'var(--tier-silver)' },
  GOLD: { name: 'Gold', short: 'Gold', color: 'var(--tier-gold)' },
  PLATINUM: { name: 'Platinum', short: 'Plat', color: 'var(--tier-platinum)' },
  EMERALD: { name: 'Emerald', short: 'Emerald', color: 'var(--tier-emerald)' },
  DIAMOND: { name: 'Diamond', short: 'Diamond', color: 'var(--tier-diamond)' },
  MASTER: { name: 'Master', short: 'Master', color: 'var(--tier-master)' },
  GRANDMASTER: { name: 'Grandmaster', short: 'GM', color: 'var(--tier-grandmaster)' },
  CHALLENGER: { name: 'Challenger', short: 'Chall', color: 'var(--tier-challenger)' },
}

const DIVISIONS = ['IV', 'III', 'II', 'I'] as const
export const APEX: ReadonlySet<string> = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])

export function isTier(t: string | null | undefined): t is Tier {
  return !!t && (TIERS as readonly string[]).includes(t)
}

export function tierIndex(t: string | null | undefined): number {
  return isTier(t) ? TIERS.indexOf(t) : -1
}

/** A single sortable number: tier, then division, then LP. Unranked sorts lowest. */
export function rankScore(tier: string | null, rank: string | null, lp: number | null): number {
  const ti = tierIndex(tier)
  if (ti < 0) return -1
  if (APEX.has(tier!)) return 7 * 400 + (lp ?? 0)
  const di = Math.max(0, DIVISIONS.indexOf((rank ?? 'IV') as (typeof DIVISIONS)[number]))
  return ti * 400 + di * 100 + (lp ?? 0)
}

export function formatRank(tier: string | null, rank: string | null): string {
  if (!isTier(tier)) return 'Unranked'
  return APEX.has(tier) ? TIER_META[tier].name : `${TIER_META[tier].name} ${rank ?? ''}`.trim()
}

export function winrate(wins: number | null, losses: number | null): number | null {
  const games = (wins ?? 0) + (losses ?? 0)
  return games ? Math.round(((wins ?? 0) / games) * 100) : null
}
