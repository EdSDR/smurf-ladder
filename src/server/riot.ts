import { env } from 'cloudflare:workers'
import { UserError } from '#/lib/errors'
import type { RiotMatch } from '#/lib/match'
import type { LiveGame } from '#/db/schema'

export class RiotError extends UserError {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

type RiotAccount = { puuid: string; gameName: string; tagLine: string }
type Summoner = { profileIconId: number; summonerLevel: number }
export type LeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}
type ActiveGame = {
  gameStartTime: number
  gameQueueConfigId: number
  participants: { puuid: string | null; riotId?: string; championId: number; teamId: number; spell1Id: number; spell2Id: number }[]
}

async function riot<T>(host: 'platform' | 'region', path: string): Promise<T | null> {
  const base = host === 'platform' ? env.RIOT_PLATFORM : env.RIOT_REGION
  // RIOT_API_ORIGIN points local dev at a fake Riot server; production always calls Riot.
  const origin = env.RIOT_API_ORIGIN ? `${env.RIOT_API_ORIGIN}/${base}` : `https://${base}.api.riotgames.com`
  const res = await fetch(`${origin}${path}`, {
    headers: { 'X-Riot-Token': env.RIOT_API_KEY },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? 'Riot API key is missing or expired.'
        : res.status === 429
          ? 'Riot API rate limit reached. Try again in a minute.'
          : `Riot API returned ${res.status}.`
    throw new RiotError(res.status, hint)
  }
  return (await res.json()) as T
}

const enc = encodeURIComponent

export function accountByRiotId(gameName: string, tagLine: string) {
  return riot<RiotAccount>('region', `/riot/account/v1/accounts/by-riot-id/${enc(gameName)}/${enc(tagLine)}`)
}

export function accountByPuuid(puuid: string) {
  return riot<RiotAccount>('region', `/riot/account/v1/accounts/by-puuid/${enc(puuid)}`)
}

export function summonerByPuuid(puuid: string) {
  return riot<Summoner>('platform', `/lol/summoner/v4/summoners/by-puuid/${enc(puuid)}`)
}

export async function leagueEntries(puuid: string) {
  return (await riot<LeagueEntry[]>('platform', `/lol/league/v4/entries/by-puuid/${enc(puuid)}`)) ?? []
}

/** The live game the player is in right now, or null. Stored by Riot ID, never PUUID. */
export async function activeGame(puuid: string): Promise<LiveGame | null> {
  const game = await riot<ActiveGame>('platform', `/lol/spectator/v5/active-games/by-summoner/${enc(puuid)}`)
  if (!game) return null
  const self = game.participants.find((p) => p.puuid === puuid)
  return {
    startedAt: game.gameStartTime || Date.now(),
    queueId: game.gameQueueConfigId,
    championId: self?.championId ?? 0,
    teams: game.participants.map((p) => ({
      team: p.teamId,
      name: p.riotId ?? '',
      champion: p.championId,
      spells: [p.spell1Id, p.spell2Id],
      self: p.puuid === puuid,
    })),
  }
}

export const QUEUE_IDS = { solo: 420, flex: 440 } as const

/** Ranked match IDs, newest first. Without a queue, both ranked queues are listed. */
export async function matchIds(puuid: string, opts: { queue?: keyof typeof QUEUE_IDS; since?: number; count: number }) {
  const q = new URLSearchParams({ count: String(opts.count) })
  if (opts.queue) q.set('queue', String(QUEUE_IDS[opts.queue]))
  else q.set('type', 'ranked')
  if (opts.since) q.set('startTime', String(Math.floor(opts.since / 1000)))
  return (await riot<string[]>('region', `/lol/match/v5/matches/by-puuid/${enc(puuid)}/ids?${q}`)) ?? []
}

export function match(matchId: string) {
  return riot<RiotMatch>('region', `/lol/match/v5/matches/${enc(matchId)}`)
}

/** Accepts "Name#TAG"; Riot IDs allow spaces in the name. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const [gameName, tagLine, ...rest] = input.trim().split('#')
  if (rest.length || !gameName?.trim() || !tagLine?.trim()) return null
  if (gameName.trim().length > 16 || tagLine.trim().length > 5) return null
  return { gameName: gameName.trim(), tagLine: tagLine.trim() }
}

export function pickQueue(entries: LeagueEntry[], queue: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR') {
  return entries.find((e) => e.queueType === queue) ?? null
}
