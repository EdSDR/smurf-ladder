import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '#/db'

const { groupKeyGrants, vaultMeta } = schema

export async function currentGroupVersion() {
  const [meta] = await getDb().select().from(vaultMeta).where(eq(vaultMeta.id, 1))
  return meta?.groupKeyVersion ?? null
}

export async function myGrant(memberId: number, version: number | null) {
  if (version === null) return null
  const [grant] = await getDb()
    .select()
    .from(groupKeyGrants)
    .where(and(eq(groupKeyGrants.memberId, memberId), eq(groupKeyGrants.keyVersion, version)))
  return grant ?? null
}
