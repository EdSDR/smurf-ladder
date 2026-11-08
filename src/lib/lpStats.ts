import { rankScore } from './tiers'

export type SnapshotPoint = { tier: string; rank: string | null; lp: number; wins: number; losses: number; takenAt: number }
export type Peak = { tier: string; rank: string | null; lp: number; at: number }
export type LpGains = { d1: number | null; d7: number | null; d30: number | null; peak: Peak | null }

const DAY = 86_400_000
const score = (s: Pick<SnapshotPoint, 'tier' | 'rank' | 'lp'>) => rankScore(s.tier, s.rank, s.lp)

/**
 * LP change over 24h, 7 and 30 days: the current rank minus the last snapshot at or before the
 * window start. If tracking began inside the window, the earliest snapshot is the baseline.
 * Snapshots must be sorted oldest first.
 */
export function lpGains(snapshots: SnapshotPoint[], now: number, previousPeak: Peak | null, seasonStart: number): LpGains {
  const current = snapshots.at(-1)
  if (!current) return { d1: null, d7: null, d30: null, peak: previousPeak }
  const gain = (days: number) => {
    const cutoff = now - days * DAY
    let base = snapshots[0]
    for (const s of snapshots) {
      if (s.takenAt <= cutoff) base = s
      else break
    }
    return base === current ? 0 : score(current) - score(base)
  }

  let peak = previousPeak && previousPeak.at >= seasonStart ? previousPeak : null
  for (const s of snapshots) {
    if (s.takenAt < seasonStart) continue
    if (!peak || score(s) > score(peak)) peak = { tier: s.tier, rank: s.rank, lp: s.lp, at: s.takenAt }
  }
  return { d1: gain(1), d7: gain(7), d30: gain(30), peak }
}

export type AttributableGame = { matchId: string; endedAt: number; win: boolean }

/**
 * Riot doesn't report LP per game, so we infer it: when exactly one game happened between two
 * consecutive snapshots, the rank difference is that game's LP. Returns matchId → LP change.
 */
export function attributeLp(snapshots: SnapshotPoint[], games: AttributableGame[], slackMs = 10 * 60_000): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = 1; i < snapshots.length; i++) {
    const a = snapshots[i - 1]
    const b = snapshots[i]
    const played = b.wins + b.losses - (a.wins + a.losses)
    if (played !== 1) continue
    const won = b.wins - a.wins === 1
    const candidates = games.filter((g) => g.endedAt > a.takenAt - slackMs && g.endedAt <= b.takenAt && g.win === won && !out.has(g.matchId))
    if (candidates.length !== 1) continue
    out.set(candidates[0].matchId, score(b) - score(a))
  }
  return out
}
