/** Aggregates over a player's stored games, shared by account and member pages. */

export type GameRow = {
  matchId: string
  endedAt: number
  remake: boolean
  win: boolean
  champion: number
  position: string | null
  kills: number
  deaths: number
  assists: number
  cs: number
  durationS: number
  score: number | null
  lpChange: number | null
}

export type ChampStat = {
  champion: number
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  cs: number
  minutes: number
  scoreSum: number
  scored: number
}

export type Summary = {
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  cs: number
  minutes: number
  scoreSum: number
  scored: number
  lp: number
  roles: Record<string, number>
}

export const kda = (k: number, d: number, a: number) => (d === 0 ? k + a : (k + a) / d)

/** Remakes don't count toward anything. */
const counted = (rows: GameRow[]) => rows.filter((r) => !r.remake)

export function champStats(rows: GameRow[]): ChampStat[] {
  const byChamp = new Map<number, ChampStat>()
  for (const r of counted(rows)) {
    const c = byChamp.get(r.champion) ?? { champion: r.champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, minutes: 0, scoreSum: 0, scored: 0 }
    c.games++
    if (r.win) c.wins++
    c.kills += r.kills
    c.deaths += r.deaths
    c.assists += r.assists
    c.cs += r.cs
    c.minutes += r.durationS / 60
    if (r.score !== null) {
      c.scoreSum += r.score
      c.scored++
    }
    byChamp.set(r.champion, c)
  }
  return [...byChamp.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)
}

/** Totals over the most recent `limit` games (rows sorted newest first). */
export function summarize(rows: GameRow[], limit = 20): Summary {
  const s: Summary = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, minutes: 0, scoreSum: 0, scored: 0, lp: 0, roles: {} }
  for (const r of counted(rows).slice(0, limit)) {
    s.games++
    if (r.win) s.wins++
    s.kills += r.kills
    s.deaths += r.deaths
    s.assists += r.assists
    s.cs += r.cs
    s.minutes += r.durationS / 60
    if (r.score !== null) {
      s.scoreSum += r.score
      s.scored++
    }
    s.lp += r.lpChange ?? 0
    if (r.position) s.roles[r.position] = (s.roles[r.position] ?? 0) + 1
  }
  return s
}

export function mainRole(summary: Summary): string | null {
  const entries = Object.entries(summary.roles).sort((a, b) => b[1] - a[1])
  return entries[0]?.[0] ?? null
}

/** Merges per-account champion stats, e.g. for a member who owns several accounts. */
export function mergeChampStats(lists: ChampStat[][]): ChampStat[] {
  const out = new Map<number, ChampStat>()
  for (const c of lists.flat()) {
    const m = out.get(c.champion)
    if (!m) out.set(c.champion, { ...c })
    else for (const k of ['games', 'wins', 'kills', 'deaths', 'assists', 'cs', 'minutes', 'scoreSum', 'scored'] as const) m[k] += c[k]
  }
  return [...out.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)
}
