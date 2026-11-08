import { and, asc, desc, eq, lt } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import { UserError } from '#/lib/errors'
import { rankScore } from '#/lib/tiers'
import type { Account, Member } from '#/db/schema'
import type { LpGains } from '#/lib/lpStats'
import { kda } from '#/lib/matchStats'
import { currentGroupVersion } from './vault.server'

const { accounts, accountStats, credentials, members } = schema
export const REFRESH_COOLDOWN_MS = 2 * 60 * 1000

export type PublicAccount = {
  id: number
  gameName: string
  tagLine: string
  iconId: number | null
  level: number | null
  solo: QueueRank | null
  flex: QueueRank | null
  inGame: boolean
  refreshedAt: number
}
export type QueueRank = {
  tier: string
  rank: string | null
  lp: number
  wins: number
  losses: number
  /** Estimated decay bank in days as of refreshedAt; null below Diamond. */
  bank: number | null
  decayPending: boolean
}

export type MemberAccount = PublicAccount & {
  ownerId: number
  ownerName: string | null
  shared: boolean
  hasCredentials: boolean
  mainRole: string | null
  topChamps: number[]
  lp: { solo: LpGains | null; flex: LpGains | null }
  last20: { games: number; wins: number; kda: number; avgScore: number | null } | null
  liveGame: { championId: number; queueId: number; startedAt: number } | null
  history: { state: 'todo' | 'listed' | 'done'; pending: number; stored: number }
}

export function queue(
  tier: string | null,
  rank: string | null,
  lp: number | null,
  wins: number | null,
  losses: number | null,
  bank: number | null = null,
  decayPending = false,
): QueueRank | null {
  return tier ? { tier, rank, lp: lp ?? 0, wins: wins ?? 0, losses: losses ?? 0, bank, decayPending } : null
}

export function toPublic(a: Account): PublicAccount {
  return {
    id: a.id,
    gameName: a.gameName,
    tagLine: a.tagLine,
    iconId: a.iconId,
    level: a.level,
    solo: queue(a.soloTier, a.soloRank, a.soloLp, a.soloWins, a.soloLosses, a.soloBank, a.soloDecayPending),
    flex: queue(a.flexTier, a.flexRank, a.flexLp, a.flexWins, a.flexLosses, a.flexBank, a.flexDecayPending),
    inGame: !!a.inGameSince,
    refreshedAt: a.refreshedAt,
  }
}

export async function memberAccounts(): Promise<MemberAccount[]> {
  const db = getDb()
  const [rows, people, creds, stats] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.gameName)),
    db.select({ id: members.id, name: members.name }).from(members),
    db.select({ accountId: credentials.accountId }).from(credentials),
    db.select().from(accountStats),
  ])
  const names = new Map(people.map((p) => [p.id, p.name]))
  const withCreds = new Set(creds.map((c) => c.accountId))
  const statsBy = new Map(stats.map((s) => [s.accountId, s]))
  return rows.map((a) => {
    const st = statsBy.get(a.id)
    const l = st?.last20
    return {
      ...toPublic(a),
      ownerId: a.ownerId,
      ownerName: names.get(a.ownerId) ?? null,
      shared: a.shared,
      hasCredentials: withCreds.has(a.id),
      mainRole: st?.mainRole ?? null,
      topChamps: (st?.champStats ?? []).slice(0, 3).map((c) => c.champion),
      lp: st?.lp ?? { solo: null, flex: null },
      last20: l && l.games ? { games: l.games, wins: l.wins, kda: kda(l.kills, l.deaths, l.assists), avgScore: l.scored ? l.scoreSum / l.scored : null } : null,
      liveGame: a.liveGame ? { championId: a.liveGame.championId, queueId: a.liveGame.queueId, startedAt: a.liveGame.startedAt } : null,
      history: { state: a.backfillState, pending: a.matchBacklog.length, stored: Math.max(0, st?.storedGames ?? 0) },
    }
  })
}

export async function requireAccount(id: number) {
  const [account] = await getDb().select().from(accounts).where(eq(accounts.id, id))
  if (!account) throw new UserError('That account no longer exists.')
  return account
}

export function assertOwner(account: Account, member: Member) {
  if (account.ownerId !== member.id && member.role !== 'admin') {
    throw new UserError('Only the member who added this account can change it.')
  }
}

// Anonymous visitors share one cached copy per Worker instance, so hammering the public page
// can't burn through the free D1 read quota.
let publicCache: { at: number; accounts: PublicAccount[] } | null = null
const PUBLIC_CACHE_MS = 60_000

export async function publicAccounts() {
  if (publicCache && Date.now() - publicCache.at < PUBLIC_CACHE_MS) return publicCache.accounts
  const rows = await getDb().select().from(accounts).orderBy(asc(accounts.gameName))
  publicCache = { at: Date.now(), accounts: rows.map(toPublic) }
  return publicCache.accounts
}

type SealedInput = { keyRef: string; wrappedItemKey: string | null }

/**
 * A login's encryption must match how it's shared: shared ones under the *current* group key
 * (so nobody keeps writing under a key a removed member still holds), private ones under the
 * owner's own item key.
 */
export async function assertSealedCorrectly(shared: boolean, cred: SealedInput | null) {
  if (!cred) return
  if (shared) {
    const version = await currentGroupVersion()
    if (version === null || cred.keyRef !== `group:${version}` || cred.wrappedItemKey) {
      throw new UserError('The group key changed since this page loaded. Reload and save again.')
    }
  } else if (cred.keyRef !== 'owner' || !cred.wrappedItemKey) {
    throw new UserError('This login wasn’t encrypted as private. Reload and save again.')
  }
}

export const MATCH_PAGE = 20

/** A page of an account's games with their full lobbies, newest first. */
export async function matchPage(accountId: number, before: number | null) {
  const db = getDb()
  const rows = await db
    .select({ player: schema.matchPlayers, match: schema.matches })
    .from(schema.matchPlayers)
    .innerJoin(schema.matches, eq(schema.matches.matchId, schema.matchPlayers.matchId))
    .where(before ? and(eq(schema.matchPlayers.accountId, accountId), lt(schema.matchPlayers.endedAt, before)) : eq(schema.matchPlayers.accountId, accountId))
    .orderBy(desc(schema.matchPlayers.endedAt))
    .limit(MATCH_PAGE)
  return rows.map(({ player, match }) => ({
    matchId: player.matchId,
    queue: player.queue,
    endedAt: player.endedAt,
    durationS: player.durationS,
    remake: player.remake,
    win: player.win,
    lpChange: player.lpChange,
    championId: player.championId,
    position: player.position,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    cs: player.cs,
    score: player.score,
    placement: player.placement,
    badge: player.badge,
    patch: match.patch,
    participants: match.participants,
  }))
}
export type MatchEntry = Awaited<ReturnType<typeof matchPage>>[number]

export async function loadAccountDetail(accountId: number) {
  const db = getDb()
  const all = await memberAccounts()
  const account = all.find((a) => a.id === accountId)
  if (!account) throw new UserError('That account no longer exists.')
  const [history, [stats], [row], page] = await Promise.all([
    db
      .select({
        queue: schema.rankSnapshots.queue,
        tier: schema.rankSnapshots.tier,
        rank: schema.rankSnapshots.rank,
        lp: schema.rankSnapshots.lp,
        wins: schema.rankSnapshots.wins,
        losses: schema.rankSnapshots.losses,
        takenAt: schema.rankSnapshots.takenAt,
      })
      .from(schema.rankSnapshots)
      .where(eq(schema.rankSnapshots.accountId, accountId))
      .orderBy(desc(schema.rankSnapshots.takenAt))
      .limit(300),
    db.select().from(schema.accountStats).where(eq(schema.accountStats.accountId, accountId)),
    db.select({ liveGame: schema.accounts.liveGame }).from(schema.accounts).where(eq(schema.accounts.id, accountId)),
    matchPage(accountId, null),
  ])
  const solo = (a: (typeof all)[number]) => rankScore(a.solo?.tier ?? null, a.solo?.rank ?? null, a.solo?.lp ?? null)
  return {
    account,
    place: account.solo ? all.filter((a) => solo(a) > solo(account)).length + 1 : null,
    groupSize: all.length,
    history: history.reverse(),
    champStats: stats?.champStats ?? [],
    last20: stats?.last20 ?? null,
    liveGame: row?.liveGame ?? null,
    matches: page,
    // Tracked accounts by Riot ID, so lobby lists can link to them.
    tracked: Object.fromEntries(all.map((a) => [`${a.gameName}#${a.tagLine}`.toLowerCase(), a.id])),
  }
}

/** What anyone may see about an account: everything except who added it and its login. */
export type PublicDetailAccount = Omit<MemberAccount, 'ownerId' | 'ownerName' | 'shared' | 'hasCredentials'>
export type FullDetail = Awaited<ReturnType<typeof loadAccountDetail>>
export const publicDetailCache = new Map<number, { at: number; value: Omit<FullDetail, 'account'> & { account: PublicDetailAccount } }>()
