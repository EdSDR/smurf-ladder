import { env } from 'cloudflare:workers'
import { Discord } from 'arctic'

export function discordClient(origin: string) {
  return new Discord(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET, `${origin}/auth/discord/callback`)
}

export type DiscordUser = { id: string; username: string; global_name: string | null; avatar: string | null }

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Discord returned ${res.status}`)
  return res.json()
}

export function avatarUrl(user: DiscordUser) {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null
}
