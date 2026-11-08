import { eq, notInArray } from 'drizzle-orm'
import { getDb, schema } from '#/db'

/**
 * Champion names, spell and rune icons, refreshed once a day from Riot's public CDNs (Data Dragon
 * and CommunityDragon). These don't count against the Riot API key, only the Worker's request limit.
 */
export type StaticData = {
  version: string
  /** championId → [name, alias]. The alias builds splash URLs (e.g. Wukong → MonkeyKing). */
  champions: Record<number, [string, string]>
  /** summoner spell id → image file name */
  spells: Record<number, string>
  /** rune (keystone or style) id → icon path under Data Dragon's img/ */
  runes: Record<number, string>
}

const KEY = 'static'
const DAY = 86_400_000
export const STATIC_FETCHES = 4

let memo: { at: number; data: StaticData } | null = null

export async function getStaticData(): Promise<StaticData | null> {
  if (memo && Date.now() - memo.at < 10 * 60_000) return memo.data
  const [row] = await getDb().select().from(schema.appMeta).where(eq(schema.appMeta.key, KEY))
  if (!row) return null
  memo = { at: Date.now(), data: row.value as StaticData }
  return memo.data
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.json() as Promise<T>
}

/** Returns true when it fetched (and so used STATIC_FETCHES outbound requests). */
export async function refreshStaticDataIfStale(now = Date.now()): Promise<boolean> {
  const db = getDb()
  const [row] = await db.select({ updatedAt: schema.appMeta.updatedAt }).from(schema.appMeta).where(eq(schema.appMeta.key, KEY))
  if (row && now - row.updatedAt < DAY) return false

  const [version] = await json<string[]>('https://ddragon.leagueoflegends.com/api/versions.json')
  const dd = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US`
  const [champions, spells, runes] = await Promise.all([
    json<{ id: number; name: string; alias: string }[]>(
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json',
    ),
    json<{ data: Record<string, { key: string; image: { full: string } }> }>(`${dd}/summoner.json`),
    json<{ id: number; icon: string; slots: { runes: { id: number; icon: string }[] }[] }[]>(`${dd}/runesReforged.json`),
  ])

  const data: StaticData = {
    version,
    champions: Object.fromEntries(champions.filter((c) => c.id > 0).map((c) => [c.id, [c.name, c.alias]])),
    spells: Object.fromEntries(Object.values(spells.data).map((s) => [Number(s.key), s.image.full])),
    runes: Object.fromEntries(runes.flatMap((style) => [[style.id, style.icon], ...style.slots.flatMap((s) => s.runes.map((r) => [r.id, r.icon]))])),
  }
  await db.batch([
    db
      .insert(schema.appMeta)
      .values({ key: KEY, value: data, updatedAt: now })
      .onConflictDoUpdate({ target: schema.appMeta.key, set: { value: data, updatedAt: now } }),
    // Once a day, drop stored matches no tracked account refers to any more.
    db.delete(schema.matches).where(notInArray(schema.matches.matchId, db.select({ id: schema.matchPlayers.matchId }).from(schema.matchPlayers))),
  ])
  memo = { at: now, data }
  return true
}
