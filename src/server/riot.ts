import { env } from 'cloudflare:workers'

export class RiotError extends Error {
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
type ActiveGame = { gameStartTime: number }
type Match = { info: { gameEndTimestamp?: number; gameCreation: number } }

async function riot<T>(host: 'platform' | 'region', path: string): Promise<T | null> {
  const base = host === 'platform' ? env.RIOT_PLATFORM : env.RIOT_REGION
  const res = await fetch(`https://${base}.api.riotgames.com${path}`, {
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

/** Returns the game's start time, or null when the player isn't in a game. */
export async function activeGameStart(puuid: string) {
  const game = await riot<ActiveGame>('platform', `/lol/spectator/v5/active-games/by-summoner/${enc(puuid)}`)
  return game ? game.gameStartTime || Date.now() : null
}

export async function lastRankedMatchId(puuid: string) {
  const ids = await riot<string[]>('region', `/lol/match/v5/matches/by-puuid/${enc(puuid)}/ids?queue=420&count=1`)
  return ids?.[0] ?? null
}

export async function matchEndedAt(matchId: string) {
  const match = await riot<Match>('region', `/lol/match/v5/matches/${enc(matchId)}`)
  return match ? (match.info.gameEndTimestamp ?? match.info.gameCreation) : null
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
