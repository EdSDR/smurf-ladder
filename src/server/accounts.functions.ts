import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { UserError } from '#/lib/errors'
import { input } from '#/lib/validate'
import { getDb, schema } from '#/db'
import { rankScore } from '#/lib/tiers'
import {
  REFRESH_COOLDOWN_MS,
  assertOwner,
  assertSealedCorrectly,
  matchPage,
  memberAccounts,
  publicAccounts,
  queue,
  requireAccount,
} from './accounts.server'
import * as riot from './riot'
import { refreshOne } from './refresh'
import { memberMiddleware } from './middleware'
import { getSessionMember } from './session'

export type { MemberAccount, PublicAccount, QueueRank } from './accounts.server'

/** Anonymous visitors get rank data only; members also see owners and credential flags. */
export const listAccounts = createServerFn({ method: 'GET' }).handler(async () => {
  const member = await getSessionMember()
  if (member) return { kind: 'member' as const, accounts: await memberAccounts() }
  return { kind: 'public' as const, accounts: await publicAccounts() }
})


const riotIdInput = z.object({ riotId: z.string().max(40) })

export const lookupRiotId = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(input(riotIdInput))
  .handler(async ({ data }) => {
    const id = riot.parseRiotId(data.riotId)
    if (!id) return { ok: false as const, error: 'Use the full Riot ID, like Name#BR1.' }
    const account = await riot.accountByRiotId(id.gameName, id.tagLine)
    if (!account) return { ok: false as const, error: `No BR account found for ${id.gameName}#${id.tagLine}.` }
    const [existing] = await getDb().select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.puuid, account.puuid))
    if (existing) return { ok: false as const, error: 'That account is already on the ladder.', existingId: existing.id }
    const [summoner, entries] = await Promise.all([riot.summonerByPuuid(account.puuid), riot.leagueEntries(account.puuid)])
    const solo = riot.pickQueue(entries, 'RANKED_SOLO_5x5')
    return {
      ok: true as const,
      preview: {
        gameName: account.gameName,
        tagLine: account.tagLine,
        iconId: summoner?.profileIconId ?? null,
        level: summoner?.summonerLevel ?? null,
        solo: solo ? queue(solo.tier, solo.rank, solo.leaguePoints, solo.wins, solo.losses) : null,
      },
    }
  })

const encryptedCredential = z.object({
  ciphertext: z.string().max(8000),
  iv: z.string().max(64),
  keyRef: z.string().regex(/^(owner|group:\d+)$/),
  wrappedItemKey: z.string().max(2000).nullable(),
})
export type EncryptedCredential = z.infer<typeof encryptedCredential>

export const addAccount = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(input(riotIdInput.extend({ shared: z.boolean(), credential: encryptedCredential.nullable() })))
  .handler(async ({ data, context }) => {
    await assertSealedCorrectly(data.shared, data.credential)
    const id = riot.parseRiotId(data.riotId)
    if (!id) throw new UserError('Use the full Riot ID, like Name#BR1.')
    const found = await riot.accountByRiotId(id.gameName, id.tagLine)
    if (!found) throw new UserError(`No BR account found for ${id.gameName}#${id.tagLine}.`)
    const summoner = await riot.summonerByPuuid(found.puuid)
    const db = getDb()
    const [account] = await db
      .insert(schema.accounts)
      .values({
        puuid: found.puuid,
        gameName: found.gameName,
        tagLine: found.tagLine,
        ownerId: context.member.id,
        shared: data.shared,
        iconId: summoner?.profileIconId ?? null,
        level: summoner?.summonerLevel ?? null,
        riotIdCheckedAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning()
    if (!account) throw new UserError('That account is already on the ladder.')
    if (data.credential) await db.insert(schema.credentials).values({ accountId: account.id, ...data.credential })
    // Lookup and summoner calls already used a few requests of this invocation's 50.
    await refreshOne(account, 44)
    return { id: account.id }
  })

const accountIdInput = z.object({ accountId: z.number().int() })

export const getAccountDetail = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput))
  .handler(async ({ data }) => {
    const db = getDb()
    const all = await memberAccounts()
    const account = all.find((a) => a.id === data.accountId)
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
        .where(eq(schema.rankSnapshots.accountId, data.accountId))
        .orderBy(desc(schema.rankSnapshots.takenAt))
        .limit(300),
      db.select().from(schema.accountStats).where(eq(schema.accountStats.accountId, data.accountId)),
      db.select({ liveGame: schema.accounts.liveGame }).from(schema.accounts).where(eq(schema.accounts.id, data.accountId)),
      matchPage(data.accountId, null),
    ])
    const solo = (a: (typeof all)[number]) => rankScore(a.solo?.tier ?? null, a.solo?.rank ?? null, a.solo?.lp ?? null)
    const place = account.solo ? all.filter((a) => solo(a) > solo(account)).length + 1 : null
    // Tracked accounts by Riot ID, so lobby lists can link to them.
    const tracked = Object.fromEntries(all.map((a) => [`${a.gameName}#${a.tagLine}`.toLowerCase(), a.id]))
    return {
      account,
      place,
      groupSize: all.length,
      history: history.reverse(),
      champStats: stats?.champStats ?? [],
      last20: stats?.last20 ?? null,
      liveGame: row?.liveGame ?? null,
      matches: page,
      tracked,
    }
  })

export const getMatchPage = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput.extend({ before: z.number().int() })))
  .handler(({ data }) => matchPage(data.accountId, data.before))

/** Ciphertext only. Shared credentials go to any member, private ones only to their owner. */
export const getCredential = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput))
  .handler(async ({ data, context }) => {
    const account = await requireAccount(data.accountId)
    if (!account.shared && account.ownerId !== context.member.id) {
      throw new UserError('This login is private to the member who added it.')
    }
    const [cred] = await getDb().select().from(schema.credentials).where(eq(schema.credentials.accountId, data.accountId))
    return cred ? { ciphertext: cred.ciphertext, iv: cred.iv, keyRef: cred.keyRef, wrappedItemKey: cred.wrappedItemKey } : null
  })

export const saveCredential = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput.extend({ shared: z.boolean(), credential: encryptedCredential.nullable() })))
  .handler(async ({ data, context }) => {
    const account = await requireAccount(data.accountId)
    assertOwner(account, context.member)
    await assertSealedCorrectly(data.shared, data.credential)
    const db = getDb()
    await db.update(schema.accounts).set({ shared: data.shared }).where(eq(schema.accounts.id, account.id))
    if (data.credential) {
      const values = { ...data.credential, updatedAt: Date.now() }
      await db
        .insert(schema.credentials)
        .values({ accountId: account.id, ...values })
        .onConflictDoUpdate({ target: schema.credentials.accountId, set: values })
    } else {
      await db.delete(schema.credentials).where(eq(schema.credentials.accountId, account.id))
    }
  })

export const deleteAccount = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput))
  .handler(async ({ data, context }) => {
    const account = await requireAccount(data.accountId)
    assertOwner(account, context.member)
    await getDb().delete(schema.accounts).where(eq(schema.accounts.id, account.id))
  })

export const refreshNow = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(input(accountIdInput))
  .handler(async ({ data }) => {
    const account = await requireAccount(data.accountId)
    const wait = account.refreshedAt + REFRESH_COOLDOWN_MS - Date.now()
    if (wait > 0) throw new UserError(`Refreshed moments ago. Try again in ${Math.ceil(wait / 1000)}s.`)
    await refreshOne(account, 45)
  })
