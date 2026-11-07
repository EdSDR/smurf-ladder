import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { deleteCookie, getCookie } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '#/db'
import { avatarUrl, discordClient, fetchDiscordUser } from '#/server/discord'
import { createSession } from '#/server/session'

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } })
}

export const Route = createFileRoute('/auth/discord/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const storedState = getCookie('discord_state')
        const verifier = getCookie('discord_verifier')
        deleteCookie('discord_state', { path: '/' })
        deleteCookie('discord_verifier', { path: '/' })
        if (!code || !state || !verifier || state !== storedState) return redirect('/?signin=failed')

        let user
        try {
          const tokens = await discordClient(url.origin).validateAuthorizationCode(code, verifier)
          user = await fetchDiscordUser(tokens.accessToken())
        } catch {
          return redirect('/?signin=failed')
        }

        const db = getDb()
        const profile = { name: user.global_name ?? user.username, avatar: avatarUrl(user) }
        let [member] = await db.select().from(schema.members).where(eq(schema.members.discordId, user.id))

        if (!member && user.id === env.ADMIN_DISCORD_ID) {
          ;[member] = await db
            .insert(schema.members)
            .values({ discordId: user.id, role: 'admin', status: 'active', ...profile })
            .returning()
        } else if (member) {
          ;[member] = await db
            .update(schema.members)
            .set({ status: 'active', ...profile })
            .where(eq(schema.members.id, member.id))
            .returning()
        } else {
          return redirect('/?signin=not-invited')
        }

        await createSession(member.id)
        return redirect(member.publicKey ? '/' : '/vault')
      },
    },
  },
})
