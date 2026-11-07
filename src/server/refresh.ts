import { asc, eq } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import type { Account } from '#/db/schema'
import * as riot from './riot'
import { queueState, rankChanged } from './snapshots'

const { accounts, rankSnapshots } = schema

/** Free plan allows 50 subrequests per invocation; each account costs 3–5 Riot calls. */
export const CRON_BATCH = 9
const CLAIM_TTL_MS = 3 * 60 * 60 * 1000
const RIOT_ID_CHECK_MS = 24 * 60 * 60 * 1000

export async function refreshAccount(account: Account): Promise<void> {
  const db = getDb()
  const now = Date.now()

  const [entries, gameStart, matchId] = await Promise.all([
    riot.leagueEntries(account.puuid),
    riot.activeGameStart(account.puuid),
    riot.lastRankedMatchId(account.puuid),
  ])

  const update: Partial<Account> = { refreshedAt: now }

  const solo = riot.pickQueue(entries, 'RANKED_SOLO_5x5')
  const flex = riot.pickQueue(entries, 'RANKED_FLEX_SR')
  const snapshots: (typeof rankSnapshots.$inferInsert)[] = []
  for (const [queue, entry] of [['solo', solo], ['flex', flex]] as const) {
    if (rankChanged(queueState(account, queue), entry)) {
      snapshots.push({
        accountId: account.id,
        queue,
        tier: entry!.tier,
        rank: entry!.rank,
        lp: entry!.leaguePoints,
        wins: entry!.wins,
        losses: entry!.losses,
        takenAt: now,
      })
    }
  }
  Object.assign(update, {
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
  })

  // A claim ends when the game it was for ends, or after 3 hours.
  const gameJustEnded = account.inGameSince && !gameStart
  update.inGameSince = gameStart
  if (account.claimedAt && (gameJustEnded || now - account.claimedAt > CLAIM_TTL_MS)) {
    update.claimedBy = null
    update.claimedAt = null
  }

  if (matchId && matchId !== account.lastRankedMatchId) {
    update.lastRankedMatchId = matchId
    update.lastRankedAt = await riot.matchEndedAt(matchId)
  }

  if (now - account.riotIdCheckedAt > RIOT_ID_CHECK_MS) {
    const current = await riot.accountByPuuid(account.puuid)
    if (current) Object.assign(update, { gameName: current.gameName, tagLine: current.tagLine })
    update.riotIdCheckedAt = now
  }

  await db.update(accounts).set(update).where(eq(accounts.id, account.id))
  if (snapshots.length) await db.insert(rankSnapshots).values(snapshots)
}

export async function refreshStalest(limit = CRON_BATCH): Promise<number> {
  const db = getDb()
  const stale = await db.select().from(accounts).orderBy(asc(accounts.refreshedAt)).limit(limit)
  let done = 0
  for (const account of stale) {
    try {
      await refreshAccount(account)
      done++
    } catch (err) {
      console.error(`refresh failed for ${account.gameName}#${account.tagLine}`, err)
      // Stop the batch on rate limits or a bad key; other errors only skip this account.
      if (err instanceof riot.RiotError && [401, 403, 429].includes(err.status)) break
    }
  }
  return done
}
