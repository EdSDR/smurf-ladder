import handler from '@tanstack/react-start/server-entry'
import { refreshStalest } from './server/refresh'

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
  "img-src 'self' data: https://raw.communitydragon.org https://cdn.discordapp.com",
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
}

export default {
  async fetch(request) {
    const response = await handler.fetch(request)
    // Vite's dev server needs websockets and eval for HMR, so headers apply to production only.
    if (!import.meta.env.PROD) return response
    const secured = new Response(response.body, response)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) secured.headers.set(k, v)
    return secured
  },
  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(refreshStalest().then((n) => console.log(`cron refreshed ${n} accounts`)))
  },
} satisfies ExportedHandler<Env>
