import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
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

    lastRankedMatchId: text('last_ranked_match_id'),
    lastRankedAt: integer('last_ranked_at'),
    inGameSince: integer('in_game_since'),
    claimedBy: integer('claimed_by').references(() => members.id, {
      onDelete: 'set null',
    }),
    claimedAt: integer('claimed_at'),
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

export type Member = typeof members.$inferSelect
export type Account = typeof accounts.$inferSelect
