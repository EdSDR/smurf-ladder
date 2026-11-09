import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import type { Account, MatchPlayer } from '#/db/schema'
import { DECAY_WINDOW_DAYS, decayRules, estimateBank, heldAtFloor } from '#/lib/decay'
import { UserError } from '#/lib/errors'
import { attributeLp, lpGains, type Peak, type SnapshotPoint } from '#/lib/lpStats'
import { findParticipant, parseMatch, queueOf, type MatchParticipant, type ParsedMatch } from '#/lib/match'
import { champStats, mainRole, summarize, type GameRow } from '#/lib/matchStats'
import { SEASON_START } from '#/lib/season'
import * as riot from './riot'
import { queueState, rankChanged } from './snapshots'
import { STATIC_FETCHES, refreshStaticDataIfStale } from './staticData'

const { accounts, accountStats, matches, matchPlayers, rankSnapshots, rankedGames } = schema

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const KEEP_GAMES = 100
const BACKFILL_GAMES = 50
const BACKFILL_GAMES_DECAY = 100

type Queue = 'solo' | 'flex'
type Db = ReturnType<typeof getDb>
type Stmt = Parameters<Db['batch']>[0][number]

/** Riot calls this run may still make (free Workers allow 50 outbound requests per invocation). */
export class Budget {
  constructor(public left: number) {}
  take(n = 1) {
    if (this.left < n) return false
    this.left -= n
    return true
  }
}

/**
 * Shared state for one run. D1 on the free plan allows 50 queries per invocation (a batch counts
 * as one), so every query goes through `q()` and work stops before the limit.
 */
export class RunContext {
  queries = 0
  matchesFetched = 0
  constructor(
    public budget: Budget,
    public tracked: Account[],
    public maxQueries = 44,
    public maxMatches = 12,
  ) {}
  q<T>(p: Promise<T>): Promise<T> {
    this.queries++
    return p
  }
  get canQuery() {
    return this.queries < this.maxQueries
  }
}

export const CRON_BUDGET = 40
/** Two calls are always needed for an account (league entries + live game). */
const BASE_COST = 2

// ---- Due-ness ---------------------------------------------------------------

function refreshInterval(a: Account, now: number) {
  if (a.inGameSince) return 5 * MIN
  if (a.lastGameAt && now - a.lastGameAt < DAY) return 10 * MIN
  return 30 * MIN
}

const isDecayTier = (a: Pick<Account, 'soloTier' | 'flexTier'>) => !!decayRules(a.soloTier) || !!decayRules(a.flexTier)

// ---- PUUID healing -------------------------------------------------------------

/**
 * Riot encrypts PUUIDs per API key, so a stored PUUID stops working whenever the key changes
 * (daily with a development key). Look the account up again by its Riot ID and keep going.
 */
async function reresolvePuuid(account: Account, ctx: RunContext): Promise<Account> {
  ctx.budget.take()
  const fresh = await riot.accountByRiotId(account.gameName, account.tagLine)
  if (!fresh) {
    throw new UserError(`Riot can't find ${account.gameName}#${account.tagLine} anymore. If it was renamed, remove it and add it again.`)
  }
  await ctx.q(
    getDb()
      .update(accounts)
      .set({ puuid: fresh.puuid, gameName: fresh.gameName, tagLine: fresh.tagLine, riotIdCheckedAt: Date.now() })
      .where(eq(accounts.id, account.id)),
  )
  const healed = { ...account, puuid: fresh.puuid, gameName: fresh.gameName, tagLine: fresh.tagLine }
  ctx.tracked = ctx.tracked.map((t) => (t.id === healed.id ? healed : t))
  return healed
}

async function leagueEntriesHealing(account: Account, ctx: RunContext) {
  try {
    return { account, entries: await riot.leagueEntries(account.puuid) }
  } catch (err) {
    if (!(err instanceof riot.RiotError) || err.status !== 400) throw err
    const healed = await reresolvePuuid(account, ctx)
    return { account: healed, entries: await riot.leagueEntries(healed.puuid) }
  }
}

// ---- Match storage -----------------------------------------------------------

function playerRow(accountId: number, m: Pick<ParsedMatch, 'matchId' | 'queueId' | 'endedAt' | 'durationS' | 'remake'>, p: MatchParticipant) {
  return {
    accountId,
    matchId: m.matchId,
    queue: queueOf(m.queueId) ?? 'solo',
    endedAt: m.endedAt,
    durationS: m.durationS,
    remake: m.remake,
    win: p.win,
    championId: p.champion,
    position: p.position,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    cs: p.cs,
    score: p.score,
    placement: p.placement,
    badge: p.badge,
    lpChange: null,
  } satisfies typeof matchPlayers.$inferInsert
}

/** Finds which tracked accounts played in a match: by current PUUID, else by Riot ID. */
function trackedInLobby(parsed: ParsedMatch, tracked: Account[]) {
  const found: { account: Account; participant: MatchParticipant }[] = []
  for (const a of tracked) {
    let i = parsed.puuidIndex[a.puuid] ?? -1
    if (i < 0) i = findParticipant(parsed.participants, a.gameName, a.tagLine)
    if (i >= 0) found.push({ account: a, participant: parsed.participants[i] })
  }
  return found
}

/**
 * Fetches (or reuses) the matches in `ids` and adds statements that store them for every tracked
 * account in each lobby. Stops when the run's budget or match cap runs out. Returns handled IDs.
 */
async function storeMatches(ids: string[], ctx: RunContext, stmts: Stmt[], touched: Set<number>) {
  const db = getDb()
  const done: string[] = []
  if (!ids.length || !ctx.canQuery) return done
  // Look at a window that fits D1's 100-parameter limit; the rest waits for the next run.
  const window = ids.slice(0, ctx.maxMatches + 20)
  const existing = await ctx.q(db.select().from(matches).where(inArray(matches.matchId, window)))
  const stored = new Map(existing.map((m) => [m.matchId, m]))

  for (const id of window) {
    const have = stored.get(id)
    let parsed: ParsedMatch
    if (have) {
      parsed = { ...have, puuidIndex: {} }
    } else {
      if (ctx.matchesFetched >= ctx.maxMatches || !ctx.budget.take()) break
      ctx.matchesFetched++
      const raw = await riot.match(id)
      if (!raw) {
        done.push(id) // gone from Riot; drop it from the backlog
        continue
      }
      parsed = parseMatch(raw)
      if (!queueOf(parsed.queueId)) {
        done.push(id)
        continue
      }
      const { puuidIndex: _, ...row } = parsed
      stmts.push(db.insert(matches).values(row).onConflictDoNothing())
      stored.set(id, row)
    }
    for (const { account, participant } of trackedInLobby(parsed, ctx.tracked)) {
      stmts.push(db.insert(matchPlayers).values(playerRow(account.id, parsed, participant)).onConflictDoNothing())
      touched.add(account.id)
    }
    done.push(id)
  }
  return done
}

// ---- Derived data -------------------------------------------------------------

type DerivedInput = {
  account: Account
  soloTier: string | null
  flexTier: string | null
  previousPeak: { solo: Peak | null; flex: Peak | null }
  recomputeLp: boolean
  recomputeStats: boolean
  backfillDone: boolean
}

/**
 * Decay banks, LP gains/peak, per-game LP and champion stats all come from the same two reads:
 * the account's stored games and its recent rank snapshots.
 */
async function deriveAccount(input: DerivedInput, ctx: RunContext, stmts: Stmt[], now: number) {
  const db = getDb()
  const { account } = input
  const update: Partial<Account> = {}
  const decayTier = !!decayRules(input.soloTier) || !!decayRules(input.flexTier)

  const games: MatchPlayer[] = await ctx.q(
    db.select().from(matchPlayers).where(eq(matchPlayers.accountId, account.id)).orderBy(desc(matchPlayers.endedAt)).limit(KEEP_GAMES + 20),
  )
  const needSnapshots = input.recomputeLp || decayTier || games.some((g) => g.lpChange === null && now - g.endedAt < 3 * DAY)
  const snaps = needSnapshots
    ? await ctx.q(
        db
          .select()
          .from(rankSnapshots)
          .where(and(eq(rankSnapshots.accountId, account.id), gte(rankSnapshots.takenAt, Math.min(now - 60 * DAY, SEASON_START))))
          .orderBy(asc(rankSnapshots.takenAt)),
      )
    : []
  const snapsBy = (queue: Queue): SnapshotPoint[] => snaps.filter((s) => s.queue === queue)

  // Decay: games in the window, from match history plus the cache that predates it.
  const legacy = decayTier
    ? await ctx.q(
        db
          .select({ matchId: rankedGames.matchId, queue: rankedGames.queue, endedAt: rankedGames.endedAt })
          .from(rankedGames)
          .where(and(eq(rankedGames.accountId, account.id), gte(rankedGames.endedAt, now - DECAY_WINDOW_DAYS * DAY))),
      )
    : []
  for (const queue of ['solo', 'flex'] as const) {
    const rules = decayRules(queue === 'solo' ? input.soloTier : input.flexTier)
    let bank: number | null = null
    let pending = false
    if (rules) {
      const seen = new Set<string>()
      const ends: number[] = []
      for (const g of [...games.filter((g) => g.queue === queue && !g.remake), ...legacy.filter((g) => g.queue === queue)]) {
        if (seen.has(g.matchId)) continue
        seen.add(g.matchId)
        ends.push(g.endedAt)
      }
      pending = !input.backfillDone && ends.length === 0
      const queueSnaps = snapsBy(queue)
      let entered: number | null = null
      for (let i = queueSnaps.length - 1; i >= 0; i--) {
        if (decayRules(queueSnaps[i].tier)?.group !== rules.group) {
          entered = queueSnaps[i + 1]?.takenAt ?? null
          break
        }
      }
      const estimate = estimateBank({ rules, games: ends, enteredTierAt: entered, now })
      bank = estimate.days
      // Snapshots are only written on change, so the newest one says how long the rank has held.
      const last = queueSnaps.at(-1) ?? { ...queueState(account, queue), takenAt: 0 }
      const floorAt = queue === 'solo' ? account.soloFloorAt : account.flexFloorAt
      if (!pending && !(floorAt && floorAt >= SEASON_START) && heldAtFloor(last, estimate, last.takenAt, now)) {
        Object.assign(update, queue === 'solo' ? { soloFloorAt: now } : { flexFloorAt: now })
      }
    }
    if (queue === 'solo') Object.assign(update, { soloBank: bank, soloDecayPending: pending })
    else Object.assign(update, { flexBank: bank, flexDecayPending: pending })
  }

  // Per-game LP, inferred from the snapshots around each game.
  for (const queue of ['solo', 'flex'] as const) {
    const open = games.filter((g) => g.queue === queue && g.lpChange === null && !g.remake && now - g.endedAt < 3 * DAY)
    if (!open.length) continue
    const lp = attributeLp(snapsBy(queue).slice(-12), open.map((g) => ({ matchId: g.matchId, endedAt: g.endedAt, win: g.win })))
    for (const [matchId, change] of lp) {
      stmts.push(db.update(matchPlayers).set({ lpChange: change }).where(and(eq(matchPlayers.accountId, account.id), eq(matchPlayers.matchId, matchId))))
      const g = games.find((x) => x.matchId === matchId)
      if (g) g.lpChange = change
    }
  }

  if (games[0]) update.lastGameAt = games[0].endedAt

  if (input.recomputeStats || input.recomputeLp) {
    const rows: GameRow[] = games.slice(0, KEEP_GAMES).map((g) => ({ ...g, champion: g.championId }))
    const values = {
      accountId: account.id,
      mainRole: mainRole(summarize(rows, 50)),
      champStats: champStats(rows),
      last20: summarize(rows, 20),
      storedGames: Math.min(games.length, KEEP_GAMES),
      ...(snaps.length
        ? {
            lp: {
              solo: snapsBy('solo').length ? lpGains(snapsBy('solo'), now, input.previousPeak.solo, SEASON_START) : null,
              flex: snapsBy('flex').length ? lpGains(snapsBy('flex'), now, input.previousPeak.flex, SEASON_START) : null,
            },
            lpUpdatedAt: now,
          }
        : {}),
      updatedAt: now,
    }
    stmts.push(db.insert(accountStats).values(values).onConflictDoUpdate({ target: accountStats.accountId, set: values }))
  }

  // Retention: keep the newest KEEP_GAMES games per account.
  if (games.length > KEEP_GAMES) {
    const cutoff = games[KEEP_GAMES - 1].endedAt
    stmts.push(db.delete(matchPlayers).where(and(eq(matchPlayers.accountId, account.id), lt(matchPlayers.endedAt, cutoff))))
  }
  return update
}

async function loadStats(accountId: number, ctx: RunContext) {
  const [row] = await ctx.q(getDb().select().from(accountStats).where(eq(accountStats.accountId, accountId)))
  return row ?? null
}

/**
 * Which of `ids` this account already has. Loads the account's stored IDs (at most ~120) rather
 * than an IN list: D1 allows only 100 bound parameters per query, and a backfill lists 100 IDs.
 */
async function knownMatchIds(accountId: number, ids: string[], ctx: RunContext) {
  if (!ids.length) return new Set<string>()
  const rows = await ctx.q(getDb().select({ id: matchPlayers.matchId }).from(matchPlayers).where(eq(matchPlayers.accountId, accountId)))
  const stored = new Set(rows.map((r) => r.id))
  return new Set(ids.filter((id) => stored.has(id)))
}

function markOthersDirty(touched: Set<number>, selfId: number, stmts: Stmt[]) {
  const db = getDb()
  for (const id of touched) if (id !== selfId) stmts.push(db.update(accountStats).set({ storedGames: -1 }).where(eq(accountStats.accountId, id)))
}

// ---- One account -----------------------------------------------------------

/** Refreshes rank, live game and new games for one account. */
export async function refreshAccount(stored: Account, ctx: RunContext): Promise<void> {
  const db = getDb()
  const now = Date.now()
  ctx.budget.take(BASE_COST)
  const stmts: Stmt[] = []
  const touched = new Set<number>()

  const { account, entries } = await leagueEntriesHealing(stored, ctx)
  const live = await riot.activeGame(account.puuid)
  const solo = riot.pickQueue(entries, 'RANKED_SOLO_5x5')
  const flex = riot.pickQueue(entries, 'RANKED_FLEX_SR')

  const update: Partial<Account> = {
    refreshedAt: now,
    inGameSince: live?.startedAt ?? null,
    liveGame: live,
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

  let snapshotAdded = false
  for (const [queue, entry] of [['solo', solo], ['flex', flex]] as const) {
    if (entry && rankChanged(queueState(account, queue), entry)) {
      snapshotAdded = true
      stmts.push(
        db.insert(rankSnapshots).values({
          accountId: account.id,
          queue,
          tier: entry.tier,
          rank: entry.rank,
          lp: entry.leaguePoints,
          wins: entry.wins,
          losses: entry.losses,
          takenAt: now,
        }),
      )
    }
  }

  // New games: only ask match-v5 when a queue's game count went up.
  let backlog = [...account.matchBacklog]
  for (const [queue, entry] of [['solo', solo], ['flex', flex]] as const) {
    if (!entry) continue
    const total = entry.wins + entry.losses
    const key = queue === 'solo' ? 'soloSyncedGames' : 'flexSyncedGames'
    const synced = account[key]
    if (synced === 0) {
      update[key] = total // first sight: older history comes from the backfill
      continue
    }
    if (total <= synced || live || !ctx.budget.take()) continue
    const since = account.lastGameAt ? account.lastGameAt - MIN : now - DECAY_WINDOW_DAYS * DAY
    const ids = await riot.matchIds(account.puuid, { queue, since, count: 20 })
    const known = await knownMatchIds(account.id, ids, ctx)
    const fresh = ids.filter((id) => !known.has(id) && !backlog.includes(id))
    backlog = [...fresh, ...backlog]
    // match-v5 can lag behind league-v4 for a few minutes, so retry for up to 30 minutes.
    if (fresh.length >= total - synced || (account.syncRetryUntil && now > account.syncRetryUntil)) {
      update[key] = total
      update.syncRetryUntil = 0
    } else if (!account.syncRetryUntil) {
      update.syncRetryUntil = now + 30 * MIN
    }
  }

  const handled = await storeMatches(backlog, ctx, stmts, touched)
  update.matchBacklog = backlog.filter((id) => !handled.includes(id))

  if (now - account.riotIdCheckedAt > DAY && ctx.budget.take()) {
    const current = await riot.accountByPuuid(account.puuid)
    if (current) Object.assign(update, { gameName: current.gameName, tagLine: current.tagLine })
    update.riotIdCheckedAt = now
  }

  // Store this run's games and snapshots before deriving numbers from them.
  if (stmts.length) await ctx.q(db.batch(stmts as [Stmt, ...Stmt[]]))
  stmts.length = 0

  const stats = await loadStats(account.id, ctx)
  const derived = await deriveAccount(
    {
      account,
      soloTier: update.soloTier ?? null,
      flexTier: update.flexTier ?? null,
      previousPeak: { solo: stats?.lp?.solo?.peak ?? null, flex: stats?.lp?.flex?.peak ?? null },
      recomputeLp: snapshotAdded || !stats || now - stats.lpUpdatedAt > HOUR,
      recomputeStats: touched.has(account.id) || !stats || stats.storedGames < 0,
      backfillDone: account.backfillState === 'done',
    },
    ctx,
    stmts,
    now,
  )
  stmts.push(db.update(accounts).set({ ...update, ...derived }).where(eq(accounts.id, account.id)))
  markOthersDirty(touched, account.id, stmts)
  await ctx.q(db.batch(stmts as [Stmt, ...Stmt[]]))
}

// ---- Backfill ---------------------------------------------------------------

/** Lists an account's older ranked games once, then fetches them a few at a time. */
async function backfillAccount(account: Account, ctx: RunContext) {
  const db = getDb()
  const now = Date.now()
  const stmts: Stmt[] = []
  const touched = new Set<number>()
  let backlog = [...account.matchBacklog]
  let state = account.backfillState

  if (state === 'todo') {
    if (!ctx.budget.take()) return
    const ids = await riot.matchIds(account.puuid, { count: isDecayTier(account) ? BACKFILL_GAMES_DECAY : BACKFILL_GAMES })
    const known = await knownMatchIds(account.id, ids, ctx)
    backlog = [...backlog, ...ids.filter((id) => !known.has(id) && !backlog.includes(id))]
    state = 'listed'
  }

  const handled = await storeMatches(backlog, ctx, stmts, touched)
  backlog = backlog.filter((id) => !handled.includes(id))
  if (state === 'listed' && backlog.length === 0) state = 'done'
  if (stmts.length) await ctx.q(db.batch(stmts as [Stmt, ...Stmt[]]))
  stmts.length = 0

  let derived: Partial<Account> = {}
  if (touched.size || state === 'done') {
    const stats = await loadStats(account.id, ctx)
    derived = await deriveAccount(
      {
        account,
        soloTier: account.soloTier,
        flexTier: account.flexTier,
        previousPeak: { solo: stats?.lp?.solo?.peak ?? null, flex: stats?.lp?.flex?.peak ?? null },
        recomputeLp: !stats,
        recomputeStats: true,
        backfillDone: state === 'done',
      },
      ctx,
      stmts,
      now,
    )
  }
  stmts.push(db.update(accounts).set({ ...derived, matchBacklog: backlog, backfillState: state }).where(eq(accounts.id, account.id)))
  markOthersDirty(touched, account.id, stmts)
  await ctx.q(db.batch(stmts as [Stmt, ...Stmt[]]))
}

// ---- Runs -------------------------------------------------------------------

/** The most queries one account can take, so a run never starts one it can't finish. */
const QUERIES_PER_ACCOUNT = 9

function isRateOrKeyError(err: unknown) {
  return err instanceof riot.RiotError && [401, 403, 429].includes(err.status)
}

/** The cron job: due accounts first, then backfill with whatever budget is left. */
export async function refreshStalest() {
  const db = getDb()
  const budget = new Budget(CRON_BUDGET)
  const staticFetched = await refreshStaticDataIfStale().catch((e) => (console.error('static data refresh failed', e), false))
  if (staticFetched) budget.take(STATIC_FETCHES)

  const all = await db.select().from(accounts)
  const ctx = new RunContext(budget, all)
  ctx.queries = staticFetched ? 3 : 2
  const now = Date.now()
  const overdue = (a: Account) => now - a.refreshedAt - refreshInterval(a, now)

  let refreshed = 0
  for (const account of all.filter((a) => overdue(a) >= 0).sort((a, b) => overdue(b) - overdue(a))) {
    if (budget.left < BASE_COST + 2 || ctx.queries + QUERIES_PER_ACCOUNT > ctx.maxQueries) break
    try {
      await refreshAccount(account, ctx)
      refreshed++
    } catch (err) {
      console.error(`refresh failed for ${account.gameName}#${account.tagLine}`, err)
      if (isRateOrKeyError(err)) return { refreshed, backfilled: 0, calls: CRON_BUDGET - budget.left, queries: ctx.queries }
    }
  }

  // Backfill: decay-tier accounts first so their countdown has 28 days of games behind it.
  let backfilled = 0
  if (budget.left >= 2 && ctx.queries + QUERIES_PER_ACCOUNT + 1 <= ctx.maxQueries) {
    const latest = (await ctx.q(db.select().from(accounts))) as Account[]
    ctx.tracked = latest
    const pending = latest
      .filter((a) => a.backfillState !== 'done')
      .sort((a, b) => Number(isDecayTier(b)) - Number(isDecayTier(a)) || a.id - b.id)
    for (const account of pending) {
      if (budget.left < 2 || ctx.matchesFetched >= ctx.maxMatches || ctx.queries + QUERIES_PER_ACCOUNT > ctx.maxQueries) break
      try {
        await backfillAccount(account, ctx)
        backfilled++
      } catch (err) {
        console.error(`backfill failed for ${account.gameName}#${account.tagLine}`, err)
        if (isRateOrKeyError(err)) break
      }
    }
  }
  return { refreshed, backfilled, calls: CRON_BUDGET - budget.left, queries: ctx.queries, matches: ctx.matchesFetched }
}

/** A member's "Refresh" button, or a freshly added account. */
export async function refreshOne(account: Account, budget: number) {
  const db = getDb()
  const ctx = new RunContext(new Budget(budget), await db.select().from(accounts), 40, 10)
  ctx.queries = 1
  await refreshAccount(account, ctx)
  const [after] = await ctx.q(db.select().from(accounts).where(eq(accounts.id, account.id)))
  if (after && after.backfillState !== 'done' && ctx.budget.left > 2 && ctx.queries + QUERIES_PER_ACCOUNT <= ctx.maxQueries) {
    await backfillAccount(after, ctx)
  }
}
