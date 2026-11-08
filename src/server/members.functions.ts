import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { UserError } from '#/lib/errors'
import { mergeChampStats, summarize, type GameRow } from '#/lib/matchStats'
import { SEASON_START } from '#/lib/season'
import { rankScore } from '#/lib/tiers'
import { input } from '#/lib/validate'
import { memberAccounts } from './accounts.server'
import { memberMiddleware } from './middleware'

/** Everything the ⌘K search can jump to. Members only: it links accounts to their owners. */
export const searchIndex = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .handler(async () => {
    const db = getDb()
    const [accounts, members] = await Promise.all([
      db
        .select({
          id: schema.accounts.id,
          gameName: schema.accounts.gameName,
          tagLine: schema.accounts.tagLine,
          tier: schema.accounts.soloTier,
          rank: schema.accounts.soloRank,
          lp: schema.accounts.soloLp,
          iconId: schema.accounts.iconId,
        })
        .from(schema.accounts),
      db.select({ id: schema.members.id, name: schema.members.name, avatar: schema.members.avatar }).from(schema.members).where(eq(schema.members.status, 'active')),
    ])
    return { accounts, members }
  })

export const listMembers = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .handler(async () => {
    const db = getDb()
    const [members, accounts, stats] = await Promise.all([
      db.select().from(schema.members).where(eq(schema.members.status, 'active')),
      db.select().from(schema.accounts),
      db.select({ accountId: schema.accountStats.accountId, champStats: schema.accountStats.champStats }).from(schema.accountStats),
    ])
    const statsBy = new Map(stats.map((s) => [s.accountId, s.champStats]))
    return members.map((m) => {
      const owned = accounts.filter((a) => a.ownerId === m.id)
      const best = owned.reduce<(typeof owned)[number] | null>(
        (top, a) => (!top || rankScore(a.soloTier, a.soloRank, a.soloLp) > rankScore(top.soloTier, top.soloRank, top.soloLp) ? a : top),
        null,
      )
      const champs = mergeChampStats(owned.map((a) => statsBy.get(a.id) ?? []))
      return {
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        tagline: m.tagline,
        bannerChampionId: m.bannerChampionId ?? champs[0]?.champion ?? null,
        accountCount: owned.length,
        inGame: owned.some((a) => a.inGameSince),
        best: best && best.soloTier ? { tier: best.soloTier, rank: best.soloRank, lp: best.soloLp ?? 0 } : null,
        topChamps: champs.slice(0, 3).map((c) => c.champion),
      }
    })
  })

export const getMember = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .validator(input(z.object({ memberId: z.number().int() })))
  .handler(async ({ data }) => {
    const db = getDb()
    const [member] = await db.select().from(schema.members).where(eq(schema.members.id, data.memberId))
    if (!member || member.status !== 'active') throw new UserError('That member doesn’t exist.')
    const owned = (await memberAccounts()).filter((a) => a.ownerId === member.id)
    const ids = owned.map((a) => a.id)
    const [stats, recent] = ids.length
      ? await Promise.all([
          db.select().from(schema.accountStats).where(inArray(schema.accountStats.accountId, ids)),
          db
            .select()
            .from(schema.matchPlayers)
            .where(inArray(schema.matchPlayers.accountId, ids))
            .orderBy(desc(schema.matchPlayers.endedAt))
            .limit(40),
        ])
      : [[], []]
    const champStats = mergeChampStats(stats.map((s) => s.champStats))
    const rows: GameRow[] = recent.map((g) => ({ ...g, champion: g.championId }))
    const games = recent.filter((g) => !g.remake).slice(0, 20)
    return {
      member: {
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        tagline: member.tagline,
        bannerChampionId: member.bannerChampionId,
      },
      bannerChampionId: member.bannerChampionId ?? champStats[0]?.champion ?? null,
      accounts: owned.sort((a, b) => rankScore(b.solo?.tier ?? null, b.solo?.rank ?? null, b.solo?.lp ?? null) - rankScore(a.solo?.tier ?? null, a.solo?.rank ?? null, a.solo?.lp ?? null)),
      champStats: champStats.slice(0, 10),
      last20: summarize(rows, 20),
      games: games.map((g) => ({
        matchId: g.matchId,
        accountId: g.accountId,
        endedAt: g.endedAt,
        win: g.win,
        championId: g.championId,
        score: g.score,
        placement: g.placement,
        badge: g.badge,
        lpChange: g.lpChange,
      })),
    }
  })

export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(
    input(
      z.object({
        bannerChampionId: z.number().int().positive().nullable(),
        tagline: z.string().trim().max(60, 'Keep the tagline under 60 characters.').nullable(),
      }),
    ),
  )
  .handler(async ({ data, context }) => {
    await getDb()
      .update(schema.members)
      .set({ bannerChampionId: data.bannerChampionId, tagline: data.tagline || null })
      .where(eq(schema.members.id, context.member.id))
  })

const RANGES = { week: 7, month: 30, season: 365 } as const
const bestCache = new Map<string, { at: number; rows: BestGame[] }>()

export type BestGame = {
  matchId: string
  accountId: number
  gameName: string
  tagLine: string
  ownerId: number
  ownerName: string | null
  endedAt: number
  queue: 'solo' | 'flex'
  win: boolean
  championId: number
  kills: number
  deaths: number
  assists: number
  cs: number
  durationS: number
  score: number
  badge: 'MVP' | 'ACE' | null
  placement: number | null
}

/** The group's highest-scoring games in a period, cached for five minutes. */
export const getBestGames = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .validator(input(z.object({ range: z.enum(['week', 'month', 'season']) })))
  .handler(async ({ data }) => {
    const hit = bestCache.get(data.range)
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.rows
    const db = getDb()
    const since = Math.max(Date.now() - RANGES[data.range] * 86_400_000, data.range === 'season' ? SEASON_START : 0)
    const rows = await db
      .select({ p: schema.matchPlayers, a: { gameName: schema.accounts.gameName, tagLine: schema.accounts.tagLine, ownerId: schema.accounts.ownerId }, ownerName: schema.members.name })
      .from(schema.matchPlayers)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.matchPlayers.accountId))
      .leftJoin(schema.members, eq(schema.members.id, schema.accounts.ownerId))
      .where(and(gte(schema.matchPlayers.endedAt, since), isNotNull(schema.matchPlayers.score), eq(schema.matchPlayers.remake, false)))
      .orderBy(desc(schema.matchPlayers.score), desc(schema.matchPlayers.kills))
      .limit(25)
    const out: BestGame[] = rows.map(({ p, a, ownerName }) => ({
      matchId: p.matchId,
      accountId: p.accountId,
      gameName: a.gameName,
      tagLine: a.tagLine,
      ownerId: a.ownerId,
      ownerName,
      endedAt: p.endedAt,
      queue: p.queue,
      win: p.win,
      championId: p.championId,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.cs,
      durationS: p.durationS,
      score: p.score!,
      badge: p.badge,
      placement: p.placement,
    }))
    bestCache.set(data.range, { at: Date.now(), rows: out })
    return out
  })
