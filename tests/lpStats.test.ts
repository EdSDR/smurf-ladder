import { describe, expect, it } from 'vitest'
import { attributeLp, lpGains, type SnapshotPoint } from '#/lib/lpStats'
import { champStats, summarize, type GameRow } from '#/lib/matchStats'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 7)
const snap = (daysAgo: number, tier: string, rank: string | null, lp: number, wins: number, losses: number): SnapshotPoint => ({ tier, rank, lp, wins, losses, takenAt: now - daysAgo * DAY })

describe('lpGains', () => {
  const snaps = [snap(40, 'GOLD', 'II', 10, 10, 10), snap(20, 'GOLD', 'I', 50, 15, 12), snap(3, 'PLATINUM', 'IV', 20, 20, 14), snap(0.5, 'PLATINUM', 'IV', 40, 21, 14)]
  it('measures gains against the snapshot before each window', () => {
    const g = lpGains(snaps, now, null, 0)
    expect(g.d1).toBe(20)
    expect(g.d7).toBe(1640 - 1550) // Gold I 50 → Plat IV 40
    expect(g.d30).toBe(1640 - 1410) // Gold II 10 → Plat IV 40
  })
  it('tracks the season peak and ignores older seasons', () => {
    expect(lpGains(snaps, now, null, 0).peak).toMatchObject({ tier: 'PLATINUM', lp: 40 })
    const old = { tier: 'DIAMOND', rank: 'IV', lp: 0, at: now - 100 * DAY }
    expect(lpGains(snaps, now, old, now - 50 * DAY).peak?.tier).toBe('PLATINUM')
    expect(lpGains(snaps, now, old, 0).peak?.tier).toBe('DIAMOND')
  })
  it('returns nulls without snapshots', () => {
    expect(lpGains([], now, null, 0)).toMatchObject({ d1: null, d7: null, d30: null })
  })
})

describe('attributeLp', () => {
  it('assigns LP only when exactly one game sits between two snapshots', () => {
    const snaps = [snap(1, 'GOLD', 'II', 50, 10, 10), snap(0.9, 'GOLD', 'II', 72, 11, 10), snap(0.5, 'GOLD', 'II', 90, 13, 10)]
    const games = [
      { matchId: 'a', endedAt: now - 0.95 * DAY, win: true },
      { matchId: 'b', endedAt: now - 0.7 * DAY, win: true },
      { matchId: 'c', endedAt: now - 0.6 * DAY, win: true },
    ]
    const out = attributeLp(snaps, games)
    expect(out.get('a')).toBe(22)
    expect(out.has('b')).toBe(false)
  })
})

describe('matchStats', () => {
  const row = (champion: number, win: boolean, over: Partial<GameRow> = {}): GameRow => ({
    matchId: Math.random().toString(), endedAt: now, remake: false, win, champion, position: 'MIDDLE', kills: 5, deaths: 2, assists: 6, cs: 180, durationS: 1800, score: 6, lpChange: win ? 20 : -18, ...over,
  })
  it('groups by champion, newest-first summaries, and skips remakes', () => {
    const rows = [row(1, true), row(1, false), row(2, true), row(3, true, { remake: true })]
    expect(champStats(rows).map((c) => [c.champion, c.games, c.wins])).toEqual([[1, 2, 1], [2, 1, 1]])
    const s = summarize(rows)
    expect(s.games).toBe(3)
    expect(s.lp).toBe(22)
    expect(s.roles.MIDDLE).toBe(3)
  })
})
