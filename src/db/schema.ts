import { sql } from 'drizzle-orm'
import type { LpGains } from '#/lib/lpStats'
import type { MatchParticipant } from '#/lib/match'
import type { ChampStat, Summary } from '#/lib/matchStats'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch() * 1000)`

export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  discordId: text('discord_id').notNull().unique(),
  name: text('name'),
  avatar: text('avatar'),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  status: text('status', { enum: ['invited', 'active'] })
    .notNull()
    .default('invited'),
  // Vault: public key in the clear, private key wrapped by a passphrase-derived key.
  publicKey: text('public_key'),
  wrappedPrivateKey: text('wrapped_private_key'),
  kdfSalt: text('kdf_salt'),
  kdfIters: integer('kdf_iters'),
  wrapIv: text('wrap_iv'),
  // Profile: banner splash (defaults to most played champion) and a short tagline.
  bannerChampionId: integer('banner_champion_id'),
  tagline: text('tagline'),
  createdAt: integer('created_at').notNull().default(now),
})

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_member_idx').on(t.memberId)],
)

export const vaultMeta = sqliteTable('vault_meta', {
  id: integer('id').primaryKey(),
  groupKeyVersion: integer('group_key_version').notNull(),
})

export const groupKeyGrants = sqliteTable(
  'group_key_grants',
  {
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    keyVersion: integer('key_version').notNull(),
    wrappedGroupKey: text('wrapped_group_key').notNull(),
    grantedBy: integer('granted_by'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.keyVersion] })],
)

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puuid: text('puuid').notNull().unique(),
    gameName: text('game_name').notNull(),
    tagLine: text('tag_line').notNull(),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
    level: integer('level'),
    iconId: integer('icon_id'),

    soloTier: text('solo_tier'),
    soloRank: text('solo_rank'),
    soloLp: integer('solo_lp'),
    soloWins: integer('solo_wins'),
    soloLosses: integer('solo_losses'),
    flexTier: text('flex_tier'),
    flexRank: text('flex_rank'),
    flexLp: integer('flex_lp'),
    flexWins: integer('flex_wins'),
    flexLosses: integer('flex_losses'),

    // Estimated decay bank in days, as of refreshedAt. Null below Diamond.
    soloBank: real('solo_bank'),
    flexBank: real('flex_bank'),
    // True while older ranked games are still being fetched, so the bank isn't trustworthy yet.
    soloDecayPending: integer('solo_decay_pending', { mode: 'boolean' }).notNull().default(false),
    flexDecayPending: integer('flex_decay_pending', { mode: 'boolean' }).notNull().default(false),
    // When the account held at Diamond II 75 LP through a decay check, which means it reached
    // Master this season even if we never saw it there. Only counts for the current season.
    soloFloorAt: integer('solo_floor_at'),
    flexFloorAt: integer('flex_floor_at'),
    inGameSince: integer('in_game_since'),
    liveGame: text('live_game', { mode: 'json' }).$type<LiveGame>(),
    // Match history sync: IDs waiting to be fetched (newest first), and games already listed.
    matchBacklog: text('match_backlog', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    backfillState: text('backfill_state', { enum: ['todo', 'listed', 'done'] }).notNull().default('todo'),
    soloSyncedGames: integer('solo_synced_games').notNull().default(0),
    flexSyncedGames: integer('flex_synced_games').notNull().default(0),
    syncRetryUntil: integer('sync_retry_until').notNull().default(0),
    lastGameAt: integer('last_game_at'),
    refreshedAt: integer('refreshed_at').notNull().default(0),
    riotIdCheckedAt: integer('riot_id_checked_at').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('accounts_refreshed_idx').on(t.refreshedAt)],
)

export const credentials = sqliteTable('credentials', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  // AES-GCM ciphertext of JSON {login, password, note}; never decrypted server-side.
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  // 'group:<version>' for shared accounts, 'owner' for private ones.
  keyRef: text('key_ref').notNull(),
  // Private accounts only: the per-item key wrapped to the owner's public key.
  wrappedItemKey: text('wrapped_item_key'),
  updatedAt: integer('updated_at').notNull().default(now),
})

export const rankSnapshots = sqliteTable(
  'rank_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    queue: text('queue', { enum: ['solo', 'flex'] }).notNull(),
    tier: text('tier').notNull(),
    rank: text('rank'),
    lp: integer('lp').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    takenAt: integer('taken_at').notNull(),
  },
  (t) => [index('snapshots_account_idx').on(t.accountId, t.queue, t.takenAt)],
)

/** End times of recent ranked games, cached so each match is fetched from Riot only once. */
export const rankedGames = sqliteTable(
  'ranked_games',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    matchId: text('match_id').notNull(),
    queue: text('queue', { enum: ['solo', 'flex'] }).notNull(),
    endedAt: integer('ended_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.matchId] })],
)

/** A ranked game, shared by every tracked account that played in it. */
export const matches = sqliteTable(
  'matches',
  {
    matchId: text('match_id').primaryKey(),
    queueId: integer('queue_id').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at').notNull(),
    durationS: integer('duration_s').notNull(),
    patch: text('patch').notNull(),
    remake: integer('remake', { mode: 'boolean' }).notNull(),
    winnerTeam: integer('winner_team'),
    participants: text('participants', { mode: 'json' }).$type<MatchParticipant[]>().notNull(),
  },
  (t) => [index('matches_ended_idx').on(t.endedAt)],
)

/** One tracked account's line in a match, copied out so lists don't parse the lobby JSON. */
export const matchPlayers = sqliteTable(
  'match_players',
  {
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.matchId, { onDelete: 'cascade' }),
    queue: text('queue', { enum: ['solo', 'flex'] }).notNull(),
    endedAt: integer('ended_at').notNull(),
    durationS: integer('duration_s').notNull(),
    remake: integer('remake', { mode: 'boolean' }).notNull(),
    win: integer('win', { mode: 'boolean' }).notNull(),
    championId: integer('champion_id').notNull(),
    position: text('position'),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    assists: integer('assists').notNull(),
    cs: integer('cs').notNull(),
    score: real('score'),
    placement: integer('placement'),
    badge: text('badge', { enum: ['MVP', 'ACE'] }),
    lpChange: integer('lp_change'),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.matchId] }),
    index('match_players_account_idx').on(t.accountId, t.endedAt),
    index('match_players_score_idx').on(t.score),
  ],
)

/** Precomputed per-account numbers so list pages never scan match history. */
export const accountStats = sqliteTable('account_stats', {
  accountId: integer('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  mainRole: text('main_role'),
  champStats: text('champ_stats', { mode: 'json' }).$type<ChampStat[]>().notNull(),
  last20: text('last20', { mode: 'json' }).$type<Summary>().notNull(),
  storedGames: integer('stored_games').notNull().default(0),
  lp: text('lp', { mode: 'json' }).$type<{ solo: LpGains | null; flex: LpGains | null }>(),
  lpUpdatedAt: integer('lp_updated_at').notNull().default(0),
  updatedAt: integer('updated_at').notNull().default(now),
})

/** Small shared values refreshed on a schedule, like the champion list from the community CDN. */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type LiveGame = {
  startedAt: number
  queueId: number
  championId: number
  teams: { team: number; name: string; champion: number; spells: [number, number]; self: boolean }[]
}

export type Member = typeof members.$inferSelect
export type Account = typeof accounts.$inferSelect
export type MatchPlayer = typeof matchPlayers.$inferSelect
