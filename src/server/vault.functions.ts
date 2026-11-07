import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, isNotNull, like } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { adminMiddleware, memberMiddleware } from './middleware'
import { currentGroupVersion, myGrant } from './vault.server'

/** Everything the browser needs to unlock the vault. All key material here is encrypted. */
export const getVaultState = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .handler(async ({ context }) => {
    const m = context.member
    const version = await currentGroupVersion()
    const grant = await myGrant(m.id, version)
    return {
      memberId: m.id,
      keys:
        m.publicKey && m.wrappedPrivateKey && m.kdfSalt && m.kdfIters && m.wrapIv
          ? {
              publicKey: m.publicKey,
              wrappedPrivateKey: m.wrappedPrivateKey,
              kdfSalt: m.kdfSalt,
              kdfIters: m.kdfIters,
              wrapIv: m.wrapIv,
            }
          : null,
      groupVersion: version,
      wrappedGroupKey: grant?.wrappedGroupKey ?? null,
    }
  })

const b64 = z.string().max(4000)

export const setupVault = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(
    z.object({
      publicKey: b64,
      wrappedPrivateKey: b64,
      kdfSalt: z.string().max(64),
      kdfIters: z.number().int().min(310_000),
      wrapIv: z.string().max(64),
      // Sent only by the first member to set up a vault: the brand-new group key, wrapped to themselves.
      wrappedGroupKey: b64.nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = getDb()
    const me = context.member
    const version = await currentGroupVersion()
    if (data.wrappedGroupKey && version !== null) throw new Error('The group vault already exists.')

    await db
      .update(schema.members)
      .set({
        publicKey: data.publicKey,
        wrappedPrivateKey: data.wrappedPrivateKey,
        kdfSalt: data.kdfSalt,
        kdfIters: data.kdfIters,
        wrapIv: data.wrapIv,
      })
      .where(eq(schema.members.id, me.id))
    // New keys invalidate old grants and private logins (they were wrapped to the old key).
    await db.delete(schema.groupKeyGrants).where(eq(schema.groupKeyGrants.memberId, me.id))
    const mine = db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.ownerId, me.id))
    await db.delete(schema.credentials).where(and(eq(schema.credentials.keyRef, 'owner'), inArray(schema.credentials.accountId, mine)))

    if (data.wrappedGroupKey) {
      await db.insert(schema.vaultMeta).values({ id: 1, groupKeyVersion: 1 })
      await db.insert(schema.groupKeyGrants).values({ memberId: me.id, keyVersion: 1, wrappedGroupKey: data.wrappedGroupKey, grantedBy: me.id })
    }
  })

/** Members who have vault keys but no copy of the current group key yet. */
export const listPendingGrants = createServerFn({ method: 'GET' })
  .middleware([memberMiddleware])
  .handler(async () => {
    const version = await currentGroupVersion()
    if (version === null) return []
    const db = getDb()
    const withKeys = await db
      .select({ id: schema.members.id, name: schema.members.name, avatar: schema.members.avatar, publicKey: schema.members.publicKey })
      .from(schema.members)
      .where(and(eq(schema.members.status, 'active'), isNotNull(schema.members.publicKey)))
    const granted = new Set(
      (await db.select({ id: schema.groupKeyGrants.memberId }).from(schema.groupKeyGrants).where(eq(schema.groupKeyGrants.keyVersion, version))).map(
        (g) => g.id,
      ),
    )
    return withKeys.filter((m) => !granted.has(m.id)).map((m) => ({ ...m, publicKey: m.publicKey! }))
  })

export const grantGroupKey = createServerFn({ method: 'POST' })
  .middleware([memberMiddleware])
  .validator(z.object({ memberId: z.number().int(), keyVersion: z.number().int(), wrappedGroupKey: b64 }))
  .handler(async ({ data, context }) => {
    const version = await currentGroupVersion()
    if (version !== data.keyVersion) throw new Error('The group key changed. Reload and try again.')
    if (!(await myGrant(context.member.id, version))) throw new Error('Unlock the vault before approving schema.members.')
    await getDb()
      .insert(schema.groupKeyGrants)
      .values({ memberId: data.memberId, keyVersion: version, wrappedGroupKey: data.wrappedGroupKey, grantedBy: context.member.id })
      .onConflictDoNothing()
  })

// ---- Admin -------------------------------------------------------------------

export const listMembers = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const version = await currentGroupVersion()
    const db = getDb()
    const [rows, grants] = await Promise.all([
      db.select().from(schema.members),
      version === null ? [] : db.select().from(schema.groupKeyGrants).where(eq(schema.groupKeyGrants.keyVersion, version)),
    ])
    const granted = new Set(grants.map((g) => g.memberId))
    return {
      groupVersion: version,
      members: rows.map((m) => ({
        id: m.id,
        discordId: m.discordId,
        name: m.name,
        avatar: m.avatar,
        role: m.role,
        status: m.status,
        publicKey: m.publicKey,
        hasGroupKey: granted.has(m.id),
      })),
    }
  })

export const inviteMember = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ discordId: z.string().regex(/^\d{15,21}$/, 'Discord user IDs are 15–21 digits.') }))
  .handler(async ({ data }) => {
    await getDb().insert(schema.members).values({ discordId: data.discordId }).onConflictDoNothing()
  })

/**
 * Removing a member rotates the group key: the admin's browser re-encrypts every shared login
 * under a new key and wraps it for the remaining schema.members, so the removed member's copy is useless.
 */
export const removeMemberAndRotate = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(
    z.object({
      memberId: z.number().int(),
      newVersion: z.number().int(),
      grants: z.array(z.object({ memberId: z.number().int(), wrappedGroupKey: b64 })),
      credentials: z.array(z.object({ accountId: z.number().int(), ciphertext: z.string().max(8000), iv: z.string().max(64) })),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.memberId === context.member.id) throw new Error("You can't remove yourself.")
    const db = getDb()
    const version = await currentGroupVersion()
    const removedOwns = db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.ownerId, data.memberId))
    type Stmt = Parameters<typeof db.batch>[0][number]
    const stmts: Stmt[] = [
      // Their private logins were only readable by them; their schema.accounts move to the admin.
      db.delete(schema.credentials).where(and(eq(schema.credentials.keyRef, 'owner'), inArray(schema.credentials.accountId, removedOwns))),
      db.update(schema.accounts).set({ ownerId: context.member.id }).where(eq(schema.accounts.ownerId, data.memberId)),
      db.delete(schema.members).where(eq(schema.members.id, data.memberId)),
    ]
    if (version !== null) {
      if (data.newVersion !== version + 1) throw new Error('The group key changed. Reload and try again.')
      const shared = await db.select({ id: schema.credentials.accountId }).from(schema.credentials).where(like(schema.credentials.keyRef, 'group:%'))
      const sent = new Set(data.credentials.map((c) => c.accountId))
      if (shared.some((c) => !sent.has(c.id))) throw new Error('Not every shared login was re-encrypted. Reload and try again.')
      const ref = `group:${data.newVersion}`
      stmts.push(
        db.update(schema.vaultMeta).set({ groupKeyVersion: data.newVersion }).where(eq(schema.vaultMeta.id, 1)),
        ...data.grants.map((g) => db.insert(schema.groupKeyGrants).values({ ...g, keyVersion: data.newVersion, grantedBy: context.member.id })),
        ...data.credentials.map((c) =>
          db
            .update(schema.credentials)
            .set({ ciphertext: c.ciphertext, iv: c.iv, keyRef: ref, updatedAt: Date.now() })
            .where(and(eq(schema.credentials.accountId, c.accountId), like(schema.credentials.keyRef, 'group:%'))),
        ),
      )
    }
    await db.batch(stmts as [Stmt, ...Stmt[]])
  })

/** Ciphertexts of every shared login, for the admin's browser to re-encrypt during key rotation. */
export const listSharedCredentials = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    return getDb()
      .select({ accountId: schema.credentials.accountId, ciphertext: schema.credentials.ciphertext, iv: schema.credentials.iv, keyRef: schema.credentials.keyRef, wrappedItemKey: schema.credentials.wrappedItemKey })
      .from(schema.credentials)
      .where(like(schema.credentials.keyRef, 'group:%'))
  })
