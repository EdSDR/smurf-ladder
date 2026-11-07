// A tiny stand-in for the Riot API, for exercising the refresh job locally without a key.
// Usage: node scripts/fake-riot.mjs, then set RIOT_API_ORIGIN=http://localhost:8788 in .dev.vars.
import { createServer } from 'node:http'

const DAY = 86_400_000
const now = Date.now()
// One Master account that played 6 Solo/Duo games two days ago, and 3 Flex games 20 days ago.
const games = {
  420: Array.from({ length: 6 }, (_, i) => ({ id: `BR1_S${i}`, end: now - 2 * DAY + i * 40 * 60_000 })),
  440: Array.from({ length: 3 }, (_, i) => ({ id: `BR1_F${i}`, end: now - 20 * DAY + i * 40 * 60_000 })),
}
const all = Object.values(games).flat()
let calls = 0

const routes = [
  [/\/riot\/account\/v1\/accounts\/by-riot-id\/([^/]+)\/([^/]+)$/, (m) => ({ puuid: 'fake-puuid', gameName: decodeURIComponent(m[1]), tagLine: decodeURIComponent(m[2]) })],
  [/\/riot\/account\/v1\/accounts\/by-puuid\//, () => ({ puuid: 'fake-puuid', gameName: 'Fake Master', tagLine: 'BR1' })],
  [/\/lol\/summoner\/v4\/summoners\/by-puuid\//, () => ({ profileIconId: 588, summonerLevel: 321 })],
  [/\/lol\/league\/v4\/entries\/by-puuid\//, () => [
    { queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I', leaguePoints: 210, wins: 120, losses: 100 },
    { queueType: 'RANKED_FLEX_SR', tier: 'DIAMOND', rank: 'III', leaguePoints: 20, wins: 30, losses: 25 },
  ]],
  [/\/lol\/spectator\/v5\/active-games\//, () => null],
  [/\/lol\/match\/v5\/matches\/by-puuid\/[^/]+\/ids\?(.*)$/, (m) => {
    const q = new URLSearchParams(m[1])
    return (games[q.get('queue')] ?? []).filter((g) => g.end >= Number(q.get('startTime')) * 1000).map((g) => g.id).reverse()
  }],
  [/\/lol\/match\/v5\/matches\/([^/?]+)$/, (m) => {
    const g = all.find((x) => x.id === m[1])
    return g ? { info: { gameCreation: g.end - 30 * 60_000, gameEndTimestamp: g.end } } : null
  }],
]

createServer((req, res) => {
  calls++
  // Like Riot after an API key change: PUUIDs from another key fail to decrypt.
  if (/by-puuid\/(?!fake-puuid)[^/?]+/.test(req.url)) {
    res.writeHead(400, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ status: { message: 'Bad Request - Exception decrypting', status_code: 400 } }))
  }
  for (const [re, handler] of routes) {
    const m = req.url.match(re)
    if (!m) continue
    const body = handler(m)
    res.writeHead(body === null ? 404 : 200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(body ?? { status: { status_code: 404 } }))
  }
  res.writeHead(404).end()
}).listen(8788, () => console.log('fake Riot API on http://localhost:8788'))
process.on('SIGTERM', () => {
  console.log(`served ${calls} calls`)
  process.exit(0)
})
