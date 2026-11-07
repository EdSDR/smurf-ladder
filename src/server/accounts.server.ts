import { asc, eq } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import { UserError } from '#/lib/errors'
import type { Account, Member } from '#/db/schema'
import { currentGroupVersion } from './vault.server'

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
