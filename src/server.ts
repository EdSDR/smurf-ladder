import handler from '@tanstack/react-start/server-entry'
import { refreshStalest } from './server/refresh'
import { purgeExpiredSessions } from './server/session'

/**
 * connect-src 'self' matters most: decrypted logins live in this page, and the policy stops a
 * script from sending them anywhere but this origin. Inline scripts stay allowed because
 * TanStack Start hydrates from an inline script.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://raw.communitydragon.org https://ddragon.leagueoflegends.com https://cdn.discordapp.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
}

export default {
  async fetch(request) {
    // Belt and braces on top of SameSite cookies: state-changing requests must come from this site.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const origin = request.headers.get('Origin')
      if (origin && origin !== new URL(request.url).origin) return new Response('Cross-site request blocked', { status: 403 })
    }
    const response = await handler.fetch(request)
    // Vite's dev server needs websockets and eval for HMR, so headers apply to production only.
    if (!import.meta.env.PROD) return response
    const secured = new Response(response.body, response)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) secured.headers.set(k, v)
    return secured
  },
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(refreshStalest().then((r) => console.log("cron", JSON.stringify(r))))
    ctx.waitUntil(purgeExpiredSessions())
  },
} satisfies ExportedHandler<Env>
