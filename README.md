# Smurf Ladder

Every League of Legends account your group shares, on one ladder. Pick a tier and see which accounts can play there. No more logging in to each one to check its rank.

![The ladder: accounts pinned on their tier, with the list below](docs/ladder.png)

- **The ladder.** Every account is pinned on its tier, from Iron to Challenger, for Solo/Duo or Flex. Click a tier to filter.
- **Live status.** Ranks, win rates and "in game now" refresh automatically every few minutes.
- **Decay countdown.** Diamond+ accounts show how many days are left before they start losing LP, separately for Solo/Duo and Flex. A filter lists everything that decays within 3 days.
- **Rank history.** Each account keeps a chart of its LP over time.
- **End-to-end encrypted logins.** Each account can store its login. You choose whether it's shared with every member or private to you. Logins are encrypted in the browser, and the server only ever holds ciphertext.
- **Members only.** Members sign in with Discord and must be on an allowlist. Anyone can see the public ladder (Riot ID and rank). Owners and logins are visible to members only.

It runs entirely on Cloudflare's free plan (Workers, D1, Cron Triggers) and the free Riot API.

![An account’s page: rank history and decay countdown for each queue](docs/account.png)

## Stack

[TanStack Start](https://tanstack.com/start) (React, SSR, server functions) · Tailwind CSS v4 + shadcn/ui · Cloudflare Workers via `@cloudflare/vite-plugin` · D1 + Drizzle ORM · Discord OAuth via [arctic](https://arcticjs.dev) · WebCrypto for the vault.

## How the decay countdown works

Riot's API doesn't expose the decay bank, so the app rebuilds it from published rules ([Riot support](https://support.riotgames.com/en-us/league-of-legends/gameplay/placements-promotions-series-demotions-and-decay)):

| Tier | Days per game | Max banked | LP lost per day at zero |
|---|---|---|---|
| Diamond | 7 | 28 | 50 |
| Master, Grandmaster, Challenger | 1 | 14 | 75 |

For each Diamond+ queue, the refresh job lists that queue's ranked games from the last 28 days, caches each game's end time (each match is fetched once), and replays them: games add days up to the cap, and one day drains per day. A promotion it has seen into Diamond or Master starts a full bank. The result is an estimate. Riot runs the daily decay at a fixed time we can't see, so it can be off by a day. The in-client profile shows the exact number.

## How the vault works

```
passphrase ──PBKDF2 (600k)──▶ key-encryption key ──wraps──▶ your RSA-OAEP private key
your public key ──wraps──▶ group AES-256 key ──encrypts──▶ shared logins
your public key ──wraps──▶ per-item AES key   ──encrypts──▶ your private logins
```

- Each member chooses a **vault passphrase** (separate from Discord). Their browser generates an RSA-OAEP-3072 keypair and seals the private key with a key derived from the passphrase. The server stores only the public key and the sealed private key.
- **Shared logins** are encrypted with one group key. The first member to set up a vault creates it. New members appear as *waiting*. An existing member compares the newcomer's **key fingerprint** over Discord, then approves them, which wraps the group key to the newcomer's public key.
- **Private logins** get a fresh key wrapped only to their owner.
- **Removing a member** rotates the group key. The admin's browser re-encrypts every shared login under a new key and wraps it for everyone who stays, listing their fingerprints first.
- **"Remember this device"** keeps your private key in IndexedDB as a *non-extractable* CryptoKey. The page can use it, but can't read its bytes out.
- **Tamper checks.** Your browser verifies that the public key the server returns matches your private key. It also remembers the group key's fingerprint and refuses a different key at the same version, so a planted key blocks shared logins instead of silently collecting new ones. The vault page shows the group-key fingerprint, which should be identical for every member.

**What it protects against:** anyone who can *read* the data, such as a leaked database dump, the Worker's logs or the D1 console. They get ciphertext only.

**What it detects, but can't prevent:** someone who can *write* to the database planting their own keys. Your browser catches a swapped group key and a mismatched own key. A new member's first approval and a rotation still rely on comparing fingerprints over Discord, so do it.

**What it doesn't protect against:**
- Whoever can deploy the Worker can ship JavaScript that reads logins as you type them. That's true of every web-based vault.
- A member who already saw a password before being removed. Change those Riot passwords if that matters.
- **A forgotten passphrase.** Your private logins are gone for good. Shared ones can be re-granted by another member after you set up a new vault.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Self-hosting

You need a Cloudflare account, a Discord application and a Riot API key. All three are free.

1. **Riot API key.** Sign in at [developer.riotgames.com](https://developer.riotgames.com). The development key works right away but expires every 24 hours. For a group of friends, register a *Personal API Key* (it doesn't expire).
2. **Discord app.** In the [Discord developer portal](https://discord.com/developers/applications), create an application. Under OAuth2, add the redirect `https://<your-domain>/auth/discord/callback` (and `http://localhost:5173/auth/discord/callback` for local dev). Copy the client ID and secret.
3. **Your Discord user ID.** Turn on Developer Mode in Discord, then right-click yourself and choose *Copy User ID*. This account becomes the first admin.
4. **Install and deploy:**

   ```sh
   pnpm install
   pnpm wrangler login
   pnpm run deploy            # creates the Worker and a D1 database named smurf-ladder
   pnpm db:migrate:remote     # creates the tables
   pnpm wrangler secret put RIOT_API_KEY
   pnpm wrangler secret put DISCORD_CLIENT_ID
   pnpm wrangler secret put DISCORD_CLIENT_SECRET
   pnpm wrangler secret put ADMIN_DISCORD_ID
   ```

   `wrangler.jsonc` has no database ID: Wrangler finds or creates the database by name on deploy, so your deployment details never need to live in the repo.

5. Add `https://<your-worker>.workers.dev/auth/discord/callback` as a redirect in the Discord portal, then sign in, set up your vault, and invite friends from **Members** by their Discord user IDs.

The region is BR by default. For another server, change `RIOT_PLATFORM` (e.g. `euw1`, `na1`) and `RIOT_REGION` (`europe`, `americas`, `asia`) in `wrangler.jsonc`.

### Local development

```sh
cp .dev.vars.example .dev.vars   # fill in the values
pnpm db:migrate:local
pnpm dev                          # http://localhost:5173
pnpm test                         # vault crypto + rank logic
```

To run the refresh job locally: `curl -X POST "http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=smurf-ladder" -d '{"cron":"*/5 * * * *"}'`.

To exercise the refresh job without a Riot key, run `node scripts/fake-riot.mjs` and set `RIOT_API_ORIGIN=http://localhost:8788` in `.dev.vars`.

### Free-tier budget

The cron runs every 5 minutes with a budget of 48 Riot calls, under the free plan's 50 outbound requests per run and Riot's 100 requests per 2 minutes. Each account costs 2 calls, plus 1 per Diamond+ queue for its match list, plus 1 per ranked game it hasn't seen before. The stalest accounts go first until the budget runs out, so a group of ~50 accounts cycles in well under an hour. A new Master account with a long backlog shows "Checking decay…" until its games are cached. Rank snapshots are written only when something changed.

## Legal

Smurf Ladder isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Sharing accounts is against Riot's Terms of Service. This project tracks ranks of accounts you own. What you do with the vault is up to you.

MIT licensed.
