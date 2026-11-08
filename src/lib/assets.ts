/**
 * Where game art comes from. Nothing here calls the Riot API.
 * - Rank crests and role icons: bundled in /public/assets (tiny, and they never change).
 * - Champions, splash art, items, spells and runes: Data Dragon, Riot's official CDN.
 * - Profile icons: CommunityDragon, whose JPGs are about 5x smaller than Data Dragon's PNGs.
 */
const DD = 'https://ddragon.leagueoflegends.com/cdn'

/** Needs the Data Dragon version and champion key (e.g. "MonkeyKing" for Wukong) from static data. */
export const champIconUrl = (version: string, key: string) => `${DD}/${version}/img/champion/${key}.png`

/** Data Dragon's splash files keep a few legacy spellings that its champion keys don't. */
const SPLASH_KEYS: Record<string, string> = { Fiddlesticks: 'FiddleSticks' }

/** Centered splash art from the champion key in static data (Wukong is "MonkeyKing"). */
export const splashUrl = (key: string, skin = 0) => `${DD}/img/champion/centered/${SPLASH_KEYS[key] ?? key}_${skin}.jpg`

export const tierCrestUrl = (tier: string | null | undefined) => `/assets/ranks/${(tier ?? 'unranked').toLowerCase()}.svg`

const ROLE_FILES: Record<string, string> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility' }
/** Null for positions we have no icon for. */
export const roleIconUrl = (position: string) => (ROLE_FILES[position] ? `/assets/roles/${ROLE_FILES[position]}.png` : null)
export const ROLE_NAMES: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' }
export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const

export const itemIconUrl = (version: string, id: number) => `${DD}/${version}/img/item/${id}.png`
export const spellIconUrl = (version: string, file: string) => `${DD}/${version}/img/spell/${file}`
export const runeIconUrl = (path: string) => `${DD}/img/${path}`
