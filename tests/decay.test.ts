import { describe, expect, it } from 'vitest'
import { atDecayFloor, bankNow, checksBetween, decayRules, decayState, estimateBank, heldAtFloor, nextDecayCheck, nextDecayDrop } from '#/lib/decay'

const DAY = 86_400_000
// 09:00 in Brasília; the next decay check is tonight at 23:45 there (02:45 UTC), 14h45m away.
const now = Date.UTC(2026, 10, 7, 12)
const tonight = Date.UTC(2026, 10, 8, 2, 45)
const HOUR = 3_600_000
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

describe('daily decay check', () => {
  it('runs at 23:45 Brasília time, which is 02:45 UTC', () => {
    expect(nextDecayCheck(now)).toBe(tonight)
    expect(nextDecayCheck(tonight)).toBe(tonight + DAY)
    expect(checksBetween(tonight - 1, tonight)).toBe(1)
    expect(checksBetween(now, now + 3 * DAY)).toBe(3)
    expect(checksBetween(now, now)).toBe(0)
  })
})

describe('estimateBank', () => {
  it('is empty with no games in the window', () => {
    expect(estimateBank({ rules: master, games: [], enteredTierAt: null, now })).toMatchObject({ days: 0 })
  })

  it('adds a week per Diamond game, capped at 28, minus one day per check', () => {
    expect(estimateBank({ rules: diamond, games: [now - 3 * DAY], enteredTierAt: null, now })).toEqual({ days: 4, decayingSince: null })
    const fiveGames = [1, 2, 3, 4, 5].map((i) => now - 10 * DAY + i * 60_000)
    expect(estimateBank({ rules: diamond, games: fiveGames, enteredTierAt: null, now }).days).toBe(18)
  })

  it('adds one day per Master game, capped at 14', () => {
    const tenGamesYesterday = Array.from({ length: 10 }, (_, i) => now - DAY + i * 60_000)
    expect(estimateBank({ rules: master, games: tenGamesYesterday, enteredTierAt: null, now }).days).toBe(9)
    const twentyGames = Array.from({ length: 20 }, (_, i) => now - DAY + i * 60_000)
    expect(estimateBank({ rules: master, games: twentyGames, enteredTierAt: null, now }).days).toBe(13)
  })

  it('starts a full bank on promotion and ignores games from before it', () => {
    const before = Array.from({ length: 5 }, (_, i) => now - 20 * DAY + i)
    expect(estimateBank({ rules: master, games: before, enteredTierAt: now - 2 * DAY, now }).days).toBe(12)
  })

  it('carries a Master bank built up more than 28 days ago', () => {
    // Two games a day for 40 days keeps the 14-day bank full; three checks have passed since the last two.
    const games = Array.from({ length: 80 }, (_, i) => now - 42 * DAY + Math.floor(i / 2) * DAY + (i % 2) * HOUR)
    expect(estimateBank({ rules: master, games, enteredTierAt: null, now }).days).toBe(11)
  })

  it('remembers the check where LP started going', () => {
    const lastGame = now - 3 * DAY // Master: 1 day banked, used up at the next check
    expect(estimateBank({ rules: master, games: [lastGame], enteredTierAt: null, now })).toEqual({ days: 0, decayingSince: tonight - 3 * DAY })
  })
})

describe('bankNow', () => {
  it('takes one day per check since the last refresh', () => {
    expect(bankNow(10, now - 3 * DAY, now)).toBe(7)
    expect(bankNow(2, now - 3 * DAY, now)).toBe(0)
    expect(bankNow(1, now - HOUR, now)).toBe(1) // no check in between
  })
})

describe('decayState', () => {
  it('describes each case', () => {
    expect(decayState('PLATINUM', null, now, false, now)).toEqual({ kind: 'none' })
    expect(decayState('MASTER', 5, now, true, now)).toEqual({ kind: 'pending' })
    expect(decayState('MASTER', 0, now, false, now)).toMatchObject({ kind: 'decaying', nextLossAt: tonight })
    expect(decayState('DIAMOND', 9, now, false, now)).toMatchObject({ kind: 'safe', days: 9, full: false, firstLossAt: tonight + 8 * DAY })
    expect(decayState('MASTER', 14, now, false, now)).toMatchObject({ kind: 'safe', days: 14, full: true })
  })

  it('counts the last banked day down to tonight’s check instead of calling it decaying', () => {
    const s = decayState('DIAMOND', 1, now, false, now)
    expect(s).toMatchObject({ kind: 'safe', days: 1, firstLossAt: tonight })
    expect(s.kind === 'safe' && s.msLeft).toBe(14 * HOUR + 45 * 60_000)
    // Once that check passes, it is decaying.
    expect(decayState('DIAMOND', 1, now, false, tonight + HOUR)).toMatchObject({ kind: 'decaying', nextLossAt: tonight + DAY })
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

describe('Diamond II 75 LP floor for accounts that reached Master', () => {
  it('knows when an account is already at its floor', () => {
    expect(atDecayFloor('DIAMOND', 'II', 75, true)).toBe(true)
    expect(atDecayFloor('DIAMOND', 'III', 40, true)).toBe(true)
    expect(atDecayFloor('DIAMOND', 'II', 90, true)).toBe(false)
    expect(atDecayFloor('DIAMOND', 'II', 75, false)).toBe(false) // never reached Master
    expect(atDecayFloor('MASTER', null, 10, true)).toBe(false)
  })

  it('reports the floor instead of decaying', () => {
    expect(decayState('DIAMOND', 0, now, false, now, { rank: 'II', lp: 75, reachedMaster: true })).toEqual({ kind: 'floor' })
    expect(decayState('DIAMOND', 0, now, false, now, { rank: 'II', lp: 75, reachedMaster: false })).toMatchObject({ kind: 'decaying' })
  })

  it('stops the projection at Diamond II 75 LP', () => {
    expect(nextDecayDrop('DIAMOND', 'I', 21, true)).toEqual({ tier: 'DIAMOND', rank: 'II', days: 1, approxLp: 75 })
    expect(nextDecayDrop('DIAMOND', 'II', 90, true)).toMatchObject({ rank: 'II', approxLp: 75, days: 1 })
    expect(nextDecayDrop('DIAMOND', 'II', 75, true)).toBeNull()
    expect(nextDecayDrop('DIAMOND', 'I', 21, false)).toMatchObject({ rank: 'II', approxLp: null })
  })

  it('infers the floor when the account held at Diamond II 75 LP through a check that should have cost LP', () => {
    const d2 = { tier: 'DIAMOND', rank: 'II', lp: 75 }
    const empty = { days: 0, decayingSince: now - 20 * DAY }
    expect(heldAtFloor(d2, empty, now - 2 * DAY, now)).toBe(true)
    expect(heldAtFloor(d2, empty, now - HOUR, now)).toBe(false) // no check since it got there
    expect(heldAtFloor(d2, empty, now, tonight + HOUR)).toBe(false) // the check may not be applied yet
    expect(heldAtFloor(d2, empty, now, tonight + 4 * HOUR)).toBe(true)
    expect(heldAtFloor(d2, { days: 3, decayingSince: null }, now - 2 * DAY, now)).toBe(false) // bank still holds
    expect(heldAtFloor({ ...d2, lp: 74 }, empty, now - 2 * DAY, now)).toBe(false)
  })
})
