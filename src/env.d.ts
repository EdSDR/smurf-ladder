// Optional, local-only override (not set in production, so `wrangler types` doesn't generate it).
declare namespace Cloudflare {
  interface Env {
    RIOT_API_ORIGIN?: string
  }
}
