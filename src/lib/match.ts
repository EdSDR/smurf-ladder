import { scoreLobby, type Badge } from './score'

/** The parts of a match-v5 payload we read. Everything else (like `challenges`) is dropped. */
export type RiotMatch = {
  metadata: { matchId: string }
  info: {
    queueId: number
    gameDuration: number
    gameVersion: string
    gameCreation: number
    gameStartTimestamp?: number
    gameEndTimestamp?: number
    teams: { teamId: number; win: boolean }[]
    participants: RiotParticipant[]
  }
}

type RiotParticipant = {
  puuid: string
  riotIdGameName?: string
  riotIdTagline?: string
  championId: number
  champLevel: number
  teamId: number
  teamPosition?: string
  individualPosition?: string
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  goldEarned: number
  totalDamageDealtToChampions: number
  visionScore: number
  win: boolean
  summoner1Id: number
  summoner2Id: number
  gameEndedInEarlySurrender?: boolean
  perks?: { styles?: { style: number; selections?: { perk: number }[] }[] }
  [item: `item${number}`]: number
}

/** One player in a stored match. Stored by Riot ID, never PUUID: PUUIDs change with the API key. */
export type MatchParticipant = {
  name: string
  tag: string
  champion: number
  champLevel: number
  team: number
  position: string | null
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  damage: number
  vision: number
  kp: number
  items: number[]
  spells: [number, number]
  keystone: number | null
  subStyle: number | null
  score: number | null
  placement: number | null
  badge: Badge
}

export type ParsedMatch = {
  matchId: string
  queueId: number
  startedAt: number
  endedAt: number
  durationS: number
  patch: string
  remake: boolean
  winnerTeam: number | null
  participants: MatchParticipant[]
  /** Positions of participants, keyed by the PUUID valid for the API key that fetched it. */
  puuidIndex: Record<string, number>
}

export const QUEUE_NAMES: Record<number, string> = { 420: 'Ranked Solo', 440: 'Ranked Flex' }
export const queueOf = (queueId: number): 'solo' | 'flex' | null => (queueId === 420 ? 'solo' : queueId === 440 ? 'flex' : null)

const POSITIONS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'])

export function parseMatch(raw: RiotMatch): ParsedMatch {
  const info = raw.info
  const remake = info.participants.some((p) => p.gameEndedInEarlySurrender) || info.gameDuration < 300
  const startedAt = info.gameStartTimestamp ?? info.gameCreation
  const endedAt = info.gameEndTimestamp ?? startedAt + info.gameDuration * 1000

  const base = info.participants.map((p) => {
    const position = POSITIONS.has(p.teamPosition ?? '') ? p.teamPosition! : POSITIONS.has(p.individualPosition ?? '') ? p.individualPosition! : null
    return {
      name: p.riotIdGameName ?? '',
      tag: p.riotIdTagline ?? '',
      champion: p.championId,
      champLevel: p.champLevel,
      team: p.teamId,
      position,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      gold: p.goldEarned,
      damage: p.totalDamageDealtToChampions,
      vision: p.visionScore,
      items: [0, 1, 2, 3, 4, 5, 6].map((i) => p[`item${i}`] ?? 0),
      spells: [p.summoner1Id, p.summoner2Id] as [number, number],
      keystone: p.perks?.styles?.[0]?.selections?.[0]?.perk ?? null,
      subStyle: p.perks?.styles?.[1]?.style ?? null,
    }
  })

  const scores = scoreLobby(base, info.gameDuration, remake)
  const participants: MatchParticipant[] = base.map((p, i) => ({
    ...p,
    kp: scores?.[i].kp ?? 0,
    score: scores?.[i].score ?? null,
    placement: scores?.[i].placement ?? null,
    badge: scores?.[i].badge ?? null,
  }))

  return {
    matchId: raw.metadata.matchId,
    queueId: info.queueId,
    startedAt,
    endedAt,
    durationS: info.gameDuration,
    patch: info.gameVersion.split('.').slice(0, 2).join('.'),
    remake,
    winnerTeam: info.teams.find((t) => t.win)?.teamId ?? null,
    participants,
    puuidIndex: Object.fromEntries(info.participants.map((p, i) => [p.puuid, i])),
  }
}

/** Finds a tracked account in a stored match by Riot ID, case-insensitively. */
export function findParticipant(participants: MatchParticipant[], gameName: string, tagLine: string) {
  const n = gameName.toLowerCase()
  const t = tagLine.toLowerCase()
  return participants.findIndex((p) => p.name.toLowerCase() === n && p.tag.toLowerCase() === t)
}
