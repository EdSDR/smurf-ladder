import { describe, expect, it } from 'vitest'
import { bankNow, decayRules, decayState, estimateBank, nextDecayDrop } from '#/lib/decay'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 7, 12)
const diamond = decayRules('DIAMOND')!
const master = decayRules('MASTER')!

describe('decay rules', () => {
  it('matches Riot’s published numbers', () => {
    expect(diamond).toMatchObject({ cap: 28, perGame: 7, lpPerDay: 50 })
    expect(master).toMatchObject({ cap: 14, perGame: 1, lpPerDay: 75 })
    expect(decayRules('GRANDMASTER')).toEqual(master)
    expect(decayRules('EMERALD')).toBeNull()
  })
})

describe('estimateBank', () => {
  it('is empty with no games in the window', () => {
    expect(estimateBank({ rules: master, games: [], enteredTierAt: null, now })).toBe(0)
  })

  it('adds a week per Diamond game, capped at 28, then drains daily', () => {
    expect(estimateBank({ rules: diamond, games: [now - 3 * DAY], enteredTierAt: null, now })).toBeCloseTo(4)
    const fiveGames = [1, 2, 3, 4, 5].map((i) => now - 10 * DAY + i * 60_000)
    expect(estimateBank({ rules: diamond, games: fiveGames, enteredTierAt: null, now })).toBeCloseTo(18, 1)
  })

  it('adds one day per Master game, capped at 14', () => {
    const tenGamesYesterday = Array.from({ length: 10 }, (_, i) => now - DAY + i * 60_000)
    expect(estimateBank({ rules: master, games: tenGamesYesterday, enteredTierAt: null, now })).toBeCloseTo(9, 1)
    const twentyGames = Array.from({ length: 20 }, (_, i) => now - DAY + i * 60_000)
    expect(estimateBank({ rules: master, games: twentyGames, enteredTierAt: null, now })).toBeCloseTo(13, 1)
  })

  it('starts a full bank on promotion and ignores games from before it', () => {
    const before = Array.from({ length: 5 }, (_, i) => now - 20 * DAY + i)
    expect(estimateBank({ rules: master, games: before, enteredTierAt: now - 2 * DAY, now })).toBeCloseTo(12)
  })

  it('keeps draining after the last refresh', () => {
    expect(bankNow(10, now - 3 * DAY, now)).toBeCloseTo(7)
    expect(bankNow(2, now - 3 * DAY, now)).toBe(0)
  })
})

describe('decayState', () => {
  it('describes each case', () => {
    expect(decayState('PLATINUM', null, now, false, now)).toEqual({ kind: 'none' })
    expect(decayState('MASTER', 5, now, true, now)).toEqual({ kind: 'pending' })
    expect(decayState('MASTER', 0.5, now, false, now)).toMatchObject({ kind: 'decaying' })
    expect(decayState('DIAMOND', 9.7, now, false, now)).toMatchObject({ kind: 'safe', days: 9, full: false })
    expect(decayState('MASTER', 14, now, false, now)).toMatchObject({ kind: 'safe', days: 14, full: true })
  })
})

describe('nextDecayDrop', () => {
  it('drops apex tiers to Diamond II at about 75 LP', () => {
    expect(nextDecayDrop('MASTER', null, 312)).toEqual({ tier: 'DIAMOND', rank: 'II', days: 5, approxLp: 75 })
    expect(nextDecayDrop('GRANDMASTER', null, 75)).toMatchObject({ tier: 'DIAMOND', rank: 'II', days: 1 })
    expect(nextDecayDrop('CHALLENGER', null, 0)).toMatchObject({ days: 1 })
  })

  it('drops Diamond one division at a time, and Diamond IV to Emerald I', () => {
    expect(nextDecayDrop('DIAMOND', 'I', 120)).toEqual({ tier: 'DIAMOND', rank: 'II', days: 3, approxLp: null })
    expect(nextDecayDrop('DIAMOND', 'IV', 21)).toMatchObject({ tier: 'EMERALD', rank: 'I', days: 1 })
  })

  it('ignores tiers that never decay', () => {
    expect(nextDecayDrop('EMERALD', 'I', 99)).toBeNull()
  })
})
