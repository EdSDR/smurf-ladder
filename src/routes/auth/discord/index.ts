import { createFileRoute } from '@tanstack/react-router'
import { generateCodeVerifier, generateState } from 'arctic'
import { setCookie } from '@tanstack/react-start/server'
import { discordClient } from '#/server/discord'

const tempCookie = { httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, path: '/', maxAge: 600 }

export const Route = createFileRoute('/auth/discord/')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const state = generateState()
        const verifier = generateCodeVerifier()
        const url = discordClient(new URL(request.url).origin).createAuthorizationURL(state, verifier, ['identify'])
        setCookie('discord_state', state, tempCookie)
        setCookie('discord_verifier', verifier, tempCookie)
        return Response.redirect(url.toString(), 302)
      },
    },
  },
})
