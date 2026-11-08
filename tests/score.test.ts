import { describe, expect, it } from 'vitest'
import fixture from './fixtures/match.json'
import { findParticipant, parseMatch, type RiotMatch } from '#/lib/match'
import { placementLabel, scoreLobby, type ScoreInput } from '#/lib/score'

const base = (over: Partial<ScoreInput>): ScoreInput => ({
  team: 100, win: true, position: 'MIDDLE', kills: 5, deaths: 5, assists: 5, cs: 200, gold: 10000, damage: 20000, vision: 20, ...over,
})

function lobby(): ScoreInput[] {
  const winners = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((position, i) => base({ team: 100, win: true, position, kills: 4 + i, damage: 15000 + i * 2000 }))
  const losers = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'].map((position, i) => base({ team: 200, win: false, position, kills: 2 + i, deaths: 7, damage: 12000 + i * 1500 }))
  return [...winners, ...losers]
}

describe('scoreLobby', () => {
  it('puts the lobby best at 10 and the average at 5', () => {
    const out = scoreLobby(lobby(), 1800)!
    expect(Math.max(...out.map((o) => o.score))).toBe(10)
    const mean = out.reduce((a, o) => a + o.score, 0) / out.length
    expect(mean).toBeGreaterThan(4.5)
    expect(mean).toBeLessThan(5.5)
  })

  it('gives one MVP on the winning team and one ACE on the losing team', () => {
    const players = lobby()
    const out = scoreLobby(players, 1800)!
    const mvp = out.findIndex((o) => o.badge === 'MVP')
    const ace = out.findIndex((o) => o.badge === 'ACE')
    expect(players[mvp].win).toBe(true)
    expect(players[ace].win).toBe(false)
    expect(out.filter((o) => o.badge).length).toBe(2)
    expect(new Set(out.map((o) => o.placement)).size).toBe(10)
  })

  it('rewards a support for vision rather than CS', () => {
    const players = lobby().map((p) => (p.position === 'UTILITY' && p.win ? { ...p, cs: 20, vision: 90, damage: 6000 } : p))
    const out = scoreLobby(players, 1800)!
    const support = players.findIndex((p) => p.position === 'UTILITY' && p.win)
    expect(out[support].score).toBeGreaterThan(5)
  })

  it('handles zero deaths and skips remakes', () => {
    const players = lobby().map((p, i) => (i === 0 ? { ...p, deaths: 0, kills: 15 } : p))
    expect(scoreLobby(players, 1800)![0].placement).toBe(1)
    expect(scoreLobby(players, 200)).toBeNull()
    expect(scoreLobby(players, 1800, true)).toBeNull()
  })

  it('labels placements', () => {
    expect(placementLabel(1, 'MVP')).toBe('MVP')
    expect(placementLabel(2, null)).toBe('2nd')
    expect(placementLabel(3, null)).toBe('3rd')
    expect(placementLabel(9, null)).toBe('9th')
  })
})

describe('parseMatch', () => {
  const parsed = parseMatch(fixture as unknown as RiotMatch)

  it('reads a real ranked game', () => {
    expect(parsed.queueId).toBe(420)
    expect(parsed.remake).toBe(false)
    expect(parsed.participants).toHaveLength(10)
    expect(parsed.patch).toMatch(/^\d+\.\d+$/)
    expect(parsed.endedAt).toBeGreaterThan(parsed.startedAt)
    expect(parsed.winnerTeam).toBe(100)
  })

  it('scores every player and keeps no PUUIDs in stored data', () => {
    expect(parsed.participants.every((p) => p.score !== null && p.placement !== null)).toBe(true)
    expect(JSON.stringify(parsed.participants)).not.toContain('puuid')
    expect(parsed.puuidIndex['test-puuid-3']).toBe(2)
  })

  it('finds a tracked player by Riot ID', () => {
    expect(findParticipant(parsed.participants, 'player 4', 'test')).toBe(3)
  })
})
