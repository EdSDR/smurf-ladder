import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import type { Account } from '#/db/schema'
import { DECAY_WINDOW_DAYS, decayRules, estimateBank } from '#/lib/decay'
import { UserError } from '#/lib/errors'
import * as riot from './riot'
import { queueState, rankChanged } from './snapshots'

const { accounts, rankSnapshots, rankedGames } = schema

const DAY = 86_400_000
const RIOT_ID_CHECK_MS = DAY

/**
 * The free Workers plan allows 50 outbound requests per invocation. A budget is shared by every
 * Riot call in one run, so a big backlog of match lookups can't blow through the limit.
 */
export class Budget {
  constructor(public left: number) {}
  take(n = 1) {
    if (this.left < n) return false
    this.left -= n
    return true
  }
}

export const CRON_BUDGET = 48
/** Base cost of one refresh: league entries + live game + one match list per Diamond+ queue. */
const BASE_COST = 4

type Queue = 'solo' | 'flex'

/** When the account entered its current decay tier group (Diamond, or Master and up), if we saw it. */
async function enteredTierAt(accountId: number, queue: Queue, group: 'diamond' | 'apex'): Promise<number | null> {
  const rows = await getDb()
    .select({ tier: rankSnapshots.tier, takenAt: rankSnapshots.takenAt })
    .from(rankSnapshots)
    .where(and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, queue)))
    .orderBy(desc(rankSnapshots.takenAt))
    .limit(200)
  let entered: number | null = null
  for (const row of rows) {
    if (decayRules(row.tier)?.group !== group) return entered
    entered = row.takenAt
  }
  return null // never seen outside this group, so we don't know when it got here
}

/** Caches new ranked games for one queue and returns the estimated bank. */
async function updateDecay(account: Account, queue: Queue, tier: string | null, budget: Budget, now: number) {
  const rules = decayRules(tier)
  if (!rules) return { bank: null, pending: false }
  const db = getDb()
  const since = now - DECAY_WINDOW_DAYS * DAY

  const ids = await riot.rankedMatchIds(account.puuid, queue, since)
  const known = new Set(
    (
      await db
        .select({ matchId: rankedGames.matchId })
        .from(rankedGames)
        .where(and(eq(rankedGames.accountId, account.id), eq(rankedGames.queue, queue)))
    ).map((r) => r.matchId),
  )
  let pending = false
  for (const matchId of ids.filter((id) => !known.has(id))) {
    if (!budget.take()) {
      pending = true
      break
    }
    const endedAt = await riot.matchEndedAt(matchId)
    if (endedAt) await db.insert(rankedGames).values({ accountId: account.id, matchId, queue, endedAt }).onConflictDoNothing()
  }

  const games = await db
    .select({ endedAt: rankedGames.endedAt })
    .from(rankedGames)
    .where(and(eq(rankedGames.accountId, account.id), eq(rankedGames.queue, queue), inArray(rankedGames.matchId, ids.length ? ids : [''])))
  const bank = estimateBank({
    rules,
    games: games.map((g) => g.endedAt),
    enteredTierAt: await enteredTierAt(account.id, queue, rules.group),
    now,
  })
  return { bank, pending }
}

/**
 * Riot encrypts PUUIDs per API key, so a stored PUUID stops working whenever the key changes
 * (daily with a development key). Look the account up again by its Riot ID and keep going.
 */
async function reresolvePuuid(account: Account, budget: Budget): Promise<Account> {
  budget.take()
  const fresh = await riot.accountByRiotId(account.gameName, account.tagLine)
  if (!fresh) {
    throw new UserError(`Riot can't find ${account.gameName}#${account.tagLine} anymore. If it was renamed, remove it and add it again.`)
  }
  await getDb()
    .update(accounts)
    .set({ puuid: fresh.puuid, gameName: fresh.gameName, tagLine: fresh.tagLine, riotIdCheckedAt: Date.now() })
    .where(eq(accounts.id, account.id))
  return { ...account, puuid: fresh.puuid, gameName: fresh.gameName, tagLine: fresh.tagLine }
}

async function leagueEntriesHealing(account: Account, budget: Budget) {
  try {
    return { account, entries: await riot.leagueEntries(account.puuid) }
  } catch (err) {
    if (!(err instanceof riot.RiotError) || err.status !== 400) throw err
    const healed = await reresolvePuuid(account, budget)
    return { account: healed, entries: await riot.leagueEntries(healed.puuid) }
  }
}

export async function refreshAccount(stored: Account, budget = new Budget(CRON_BUDGET)): Promise<void> {
  const db = getDb()
  const now = Date.now()
  budget.take(2)

  const { account, entries } = await leagueEntriesHealing(stored, budget)
  const gameStart = await riot.activeGameStart(account.puuid)
  const solo = riot.pickQueue(entries, 'RANKED_SOLO_5x5')
  const flex = riot.pickQueue(entries, 'RANKED_FLEX_SR')

  const update: Partial<Account> = {
    refreshedAt: now,
    inGameSince: gameStart,
    soloTier: solo?.tier ?? null,
    soloRank: solo?.rank ?? null,
    soloLp: solo?.leaguePoints ?? null,
    soloWins: solo?.wins ?? null,
    soloLosses: solo?.losses ?? null,
    flexTier: flex?.tier ?? null,
    flexRank: flex?.rank ?? null,
    flexLp: flex?.leaguePoints ?? null,
    flexWins: flex?.wins ?? null,
    flexLosses: flex?.losses ?? null,
  }

  // Snapshots first: a promotion recorded now feeds the decay estimate below.
  const snapshots: (typeof rankSnapshots.$inferInsert)[] = []
  for (const [queue, entry] of [['solo', solo], ['flex', flex]] as const) {
    if (entry && rankChanged(queueState(account, queue), entry)) {
      snapshots.push({
        accountId: account.id,
        queue,
        tier: entry.tier,
        rank: entry.rank,
        lp: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
        takenAt: now,
      })
    }
  }
  if (snapshots.length) await db.insert(rankSnapshots).values(snapshots)

  for (const [queue, entry] of [['solo', solo], ['flex', flex]] as const) {
    if (decayRules(entry?.tier)) budget.take()
    const { bank, pending } = await updateDecay(account, queue, entry?.tier ?? null, budget, now)
    if (queue === 'solo') Object.assign(update, { soloBank: bank, soloDecayPending: pending })
    else Object.assign(update, { flexBank: bank, flexDecayPending: pending })
  }

  if (now - account.riotIdCheckedAt > RIOT_ID_CHECK_MS && budget.take()) {
    const current = await riot.accountByPuuid(account.puuid)
    if (current) Object.assign(update, { gameName: current.gameName, tagLine: current.tagLine })
    update.riotIdCheckedAt = now
  }

  await db.update(accounts).set(update).where(eq(accounts.id, account.id))
  await db.delete(rankedGames).where(and(eq(rankedGames.accountId, account.id), lt(rankedGames.endedAt, now - (DECAY_WINDOW_DAYS + 2) * DAY)))
}

/** Refreshes the stalest accounts until the run's request budget is spent. */
export async function refreshStalest(): Promise<number> {
  const db = getDb()
  const budget = new Budget(CRON_BUDGET)
  const stale = await db.select().from(accounts).orderBy(asc(accounts.refreshedAt)).limit(12)
  let done = 0
  for (const account of stale) {
    if (budget.left < BASE_COST) break
    try {
      await refreshAccount(account, budget)
      done++
    } catch (err) {
      console.error(`refresh failed for ${account.gameName}#${account.tagLine}`, err)
      // Stop the batch on rate limits or a bad key; other errors only skip this account.
      if (err instanceof riot.RiotError && [401, 403, 429].includes(err.status)) break
    }
  }
  return done
}
