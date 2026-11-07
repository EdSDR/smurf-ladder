import { asc, eq } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import type { Account, Member } from '#/db/schema'

const { accounts, credentials, members } = schema
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
  const [rows, people, creds] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.gameName)),
    db.select({ id: members.id, name: members.name }).from(members),
    db.select({ accountId: credentials.accountId }).from(credentials),
  ])
  const names = new Map(people.map((p) => [p.id, p.name]))
  const withCreds = new Set(creds.map((c) => c.accountId))
  return rows.map((a) => ({
    ...toPublic(a),
    ownerId: a.ownerId,
    ownerName: names.get(a.ownerId) ?? null,
    shared: a.shared,
    hasCredentials: withCreds.has(a.id),
  }))
}

export async function requireAccount(id: number) {
  const [account] = await getDb().select().from(accounts).where(eq(accounts.id, id))
  if (!account) throw new Error('That account no longer exists.')
  return account
}

export function assertOwner(account: Account, member: Member) {
  if (account.ownerId !== member.id && member.role !== 'admin') {
    throw new Error('Only the member who added this account can change it.')
  }
}

