import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'
import { and, eq, gt, lt } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import type { Member } from '#/db/schema'

// __Host- pins the cookie to this exact origin over HTTPS (no subdomain can set or read it).
// Plain-HTTP localhost can't use the prefix, so dev keeps the bare name.
const COOKIE = import.meta.env.PROD ? '__Host-sl_session' : 'sl_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
  path: '/',
  expires,
})

export async function createSession(memberId: number) {
  const token = randomToken()
  const expiresAt = Date.now() + TTL_MS
  await getDb()
    .insert(schema.sessions)
    .values({ tokenHash: await sha256Hex(token), memberId, expiresAt })
  setCookie(COOKIE, token, cookieOptions(new Date(expiresAt)))
}

export async function destroySession() {
  const token = getCookie(COOKIE)
  if (token) {
    await getDb()
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, await sha256Hex(token)))
  }
  deleteCookie(COOKIE, { path: '/', secure: import.meta.env.PROD })
}

/** The signed-in, active member for this request, or null. */
export async function getSessionMember(): Promise<Member | null> {
  const token = getCookie(COOKIE)
  if (!token) return null
  const db = getDb()
  const tokenHash = await sha256Hex(token)
  const now = Date.now()
  const [row] = await db
    .select({ member: schema.members, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.members, eq(schema.members.id, schema.sessions.memberId))
    .where(and(eq(schema.sessions.tokenHash, tokenHash), gt(schema.sessions.expiresAt, now)))
  if (!row || row.member.status !== 'active') return null

  if (row.expiresAt - now < RENEW_BELOW_MS) {
    const expiresAt = now + TTL_MS
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.tokenHash, tokenHash))
    setCookie(COOKIE, token, cookieOptions(new Date(expiresAt)))
  }
  return row.member
}

export async function purgeExpiredSessions() {
  await getDb().delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now()))
}
