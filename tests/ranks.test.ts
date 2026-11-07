import { describe, expect, it } from 'vitest'
import { decayAtRisk, formatRank, rankScore, winrate } from '#/lib/tiers'
import { rankChanged } from '#/server/snapshots'

describe('rank math', () => {
  it('orders tiers, divisions and LP', () => {
    expect(rankScore('GOLD', 'I', 0)).toBeGreaterThan(rankScore('GOLD', 'II', 99))
    expect(rankScore('PLATINUM', 'IV', 0)).toBeGreaterThan(rankScore('GOLD', 'I', 99))
    expect(rankScore('MASTER', 'I', 10)).toBeGreaterThan(rankScore('DIAMOND', 'I', 99))
    expect(rankScore(null, null, null)).toBe(-1)
  })

  it('formats apex tiers without a division', () => {
    expect(formatRank('MASTER', 'I')).toBe('Master')
    expect(formatRank('GOLD', 'II')).toBe('Gold II')
    expect(formatRank(null, null)).toBe('Unranked')
  })

  it('computes win rate', () => {
    expect(winrate(58, 42)).toBe(58)
    expect(winrate(0, 0)).toBeNull()
  })

  it('flags decay only for Diamond and up after 21 idle days', () => {
    const now = Date.UTC(2026, 10, 7)
    const day = 86_400_000
    expect(decayAtRisk('DIAMOND', now - 22 * day, now)).toBe(true)
    expect(decayAtRisk('DIAMOND', now - 5 * day, now)).toBe(false)
    expect(decayAtRisk('EMERALD', now - 60 * day, now)).toBe(false)
  })
})

describe('snapshots', () => {
  const prev = { tier: 'GOLD', rank: 'II', lp: 41, wins: 58, losses: 55 }
  const entry = { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 41, wins: 58, losses: 55 }
  it('skips unchanged ranks', () => expect(rankChanged(prev, entry)).toBe(false))
  it('records a played game', () => expect(rankChanged(prev, { ...entry, leaguePoints: 60, wins: 59 })).toBe(true))
  it('ignores missing entries', () => expect(rankChanged(prev, null)).toBe(false))
})
