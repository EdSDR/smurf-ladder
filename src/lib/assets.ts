/**
 * URLs for official game art from Riot's public CDNs: Data Dragon (versioned) and
 * CommunityDragon (latest). Nothing here calls the Riot API.
 */
const CD = 'https://raw.communitydragon.org/latest/plugins'
const DD = 'https://ddragon.leagueoflegends.com/cdn'

export const champIconUrl = (id: number) => `${CD}/rcp-be-lol-game-data/global/default/v1/champion-icons/${id > 0 ? id : -1}.png`

/** Centered splash art; needs the champion's alias from static data (Wukong is "MonkeyKing"). */
export const splashUrl = (alias: string, skin = 0) => `${DD}/img/champion/centered/${alias}_${skin}.jpg`

export const tierCrestUrl = (tier: string | null | undefined) =>
  `${CD}/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${(tier ?? 'unranked').toLowerCase()}.svg`

const ROLE_FILES: Record<string, string> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility' }
export const roleIconUrl = (position: string) => `${CD}/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${ROLE_FILES[position] ?? 'fill'}.png`
export const ROLE_NAMES: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' }
export const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const

export const itemIconUrl = (version: string, id: number) => `${DD}/${version}/img/item/${id}.png`
export const spellIconUrl = (version: string, file: string) => `${DD}/${version}/img/spell/${file}`
export const runeIconUrl = (path: string) => `${DD}/img/${path}`
