/**
 * Our own per-game performance score, inspired by TrackDiff's "DIFF score". Each player is
 * compared with the other nine in the same game, so 10 is always the lobby's best and 5 its
 * average. It's an estimate, not an official Riot number.
 */

export type ScoreInput = {
  team: number
  win: boolean
  position: string | null
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  damage: number
  vision: number
}

export type Badge = 'MVP' | 'ACE' | null
export type ScoreOutput = { score: number; placement: number; badge: Badge; kp: number }

type Metric = 'kda' | 'kp' | 'dmg' | 'gold' | 'cs' | 'vis'
const DEFAULT_WEIGHTS: Record<Metric, number> = { kda: 0.25, kp: 0.2, dmg: 0.2, gold: 0.1, cs: 0.15, vis: 0.1 }
const WEIGHTS: Record<string, Record<Metric, number>> = {
  JUNGLE: { kda: 0.25, kp: 0.25, dmg: 0.15, gold: 0.1, cs: 0.1, vis: 0.15 },
  UTILITY: { kda: 0.25, kp: 0.25, dmg: 0.1, gold: 0.05, cs: 0, vis: 0.35 },
}
const WIN_BONUS = 0.03
const KDA_CAP = 15

export const REMAKE_SECONDS = 300

/** Returns null for remakes: they're too short to rate anyone. */
export function scoreLobby(players: ScoreInput[], durationS: number, earlySurrender = false): ScoreOutput[] | null {
  if (earlySurrender || durationS < REMAKE_SECONDS || players.length === 0) return null
  const minutes = durationS / 60

  const teamTotals = new Map<number, { kills: number; damage: number; gold: number }>()
  for (const p of players) {
    const t = teamTotals.get(p.team) ?? { kills: 0, damage: 0, gold: 0 }
    t.kills += p.kills
    t.damage += p.damage
    t.gold += p.gold
    teamTotals.set(p.team, t)
  }

  const metrics = players.map((p) => {
    const t = teamTotals.get(p.team)!
    return {
      kda: Math.min((p.kills + p.assists) / Math.max(1, p.deaths), KDA_CAP),
      kp: (p.kills + p.assists) / Math.max(1, t.kills),
      dmg: p.damage / Math.max(1, t.damage),
      gold: p.gold / Math.max(1, t.gold),
      cs: p.cs / minutes,
      vis: p.vision / minutes,
    } satisfies Record<Metric, number>
  })

  const best = {} as Record<Metric, number>
  for (const m of Object.keys(DEFAULT_WEIGHTS) as Metric[]) best[m] = Math.max(...metrics.map((x) => x[m]))

  const raw = players.map((p, i) => {
    const w = WEIGHTS[p.position ?? ''] ?? DEFAULT_WEIGHTS
    let r = 0
    for (const m of Object.keys(w) as Metric[]) r += best[m] > 0 ? (w[m] * metrics[i][m]) / best[m] : 0
    return r + (p.win ? WIN_BONUS : 0)
  })

  const mean = raw.reduce((a, b) => a + b, 0) / raw.length
  const max = Math.max(...raw)
  const spread = Math.max(max - mean, 1e-6)
  const scores = raw.map((r) => Math.round(Math.min(10, Math.max(0, 5 + (5 * (r - mean)) / spread)) * 10) / 10)

  const order = players
    .map((_, i) => i)
    .sort((a, b) => scores[b] - scores[a] || raw[b] - raw[a] || players[b].damage - players[a].damage)
  const placement = new Array<number>(players.length)
  order.forEach((idx, rank) => (placement[idx] = rank + 1))

  const topOf = (win: boolean) => order.find((i) => players[i].win === win)
  const mvp = topOf(true)
  const ace = topOf(false)

  return players.map((_, i) => ({
    score: scores[i],
    placement: placement[i],
    badge: i === mvp ? 'MVP' : i === ace ? 'ACE' : null,
    kp: Math.round(metrics[i].kp * 100) / 100,
  }))
}

/** "MVP", "ACE", or an ordinal like "2nd". */
export function placementLabel(placement: number, badge: Badge): string {
  if (badge) return badge
  const suffix = placement === 2 ? 'nd' : placement === 3 ? 'rd' : placement === 1 ? 'st' : 'th'
  return `${placement}${suffix}`
}
