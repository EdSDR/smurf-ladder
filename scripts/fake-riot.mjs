// A stand-in for the Riot API, for exercising the refresh job locally without a key.
// Usage: node scripts/fake-riot.mjs, then set RIOT_API_ORIGIN=http://localhost:8788 in .dev.vars.
//
// Two players exist: "Fake Master#BR1" (Master solo, Diamond flex, 30 ranked games over 25 days)
// and "Fake Duo#BR1" (Diamond solo, duos in 10 of those games, currently in a live game).
// Like Riot after an API key change, unknown PUUIDs fail with 400 "Exception decrypting".
import { createServer } from 'node:http'

const DAY = 86_400_000
const now = Date.now()
const players = {
  'fake-master': { name: 'Fake Master', tag: 'BR1', solo: ['MASTER', 'I', 210, 120, 100], flex: ['DIAMOND', 'III', 20, 30, 25] },
  'fake-duo': { name: 'Fake Duo', tag: 'BR1', solo: ['DIAMOND', 'II', 55, 80, 70], flex: null },
}
const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
const CHAMPS = [222, 64, 103, 412, 157, 86, 498, 117, 236, 25]

// Deterministic pseudo-random numbers so every run serves the same history.
let seed = 7
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))

const matches = Array.from({ length: 30 }, (_, i) => {
  const ended = now - (i * 25 * DAY) / 30 - 3600_000
  const duration = i === 7 ? 200 : int(1300, 2200) // one remake
  const queue = i % 6 === 5 ? 440 : 420
  const duo = i % 3 === 0
  const masterWins = rand() > 0.45
  const participants = Array.from({ length: 10 }, (_, p) => {
    const team = p < 5 ? 100 : 200
    const win = team === 100 ? masterWins : !masterWins
    const puuid = p === 0 ? 'fake-master' : p === 1 && duo ? 'fake-duo' : `stranger-${i}-${p}`
    const who = players[puuid]
    return {
      puuid,
      riotIdGameName: who ? who.name : `Stranger ${p}`,
      riotIdTagline: who ? who.tag : 'XYZ',
      championId: CHAMPS[(p + i) % CHAMPS.length],
      champLevel: int(11, 18),
      teamId: team,
      teamPosition: POSITIONS[p % 5],
      individualPosition: POSITIONS[p % 5],
      kills: int(0, 14),
      deaths: int(1, 10),
      assists: int(0, 18),
      totalMinionsKilled: p % 5 === 4 ? int(10, 40) : int(120, 280),
      neutralMinionsKilled: p % 5 === 1 ? int(120, 200) : int(0, 12),
      goldEarned: int(7000, 16000),
      totalDamageDealtToChampions: int(6000, 38000),
      visionScore: p % 5 === 4 ? int(40, 90) : int(8, 35),
      win,
      summoner1Id: 4,
      summoner2Id: p % 5 === 1 ? 11 : 14,
      gameEndedInEarlySurrender: duration < 300,
      perks: { styles: [{ style: 8000, selections: [{ perk: 8010 }] }, { style: 8400 }] },
      ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((k) => [`item${k}`, k === 6 ? 3340 : 1000 + int(1, 3000)])),
    }
  })
  return {
    metadata: { matchId: `BR1_9${String(1000 + i)}` },
    info: {
      queueId: queue,
      gameDuration: duration,
      gameVersion: '16.21.834.2754',
      gameCreation: ended - duration * 1000 - 60_000,
      gameStartTimestamp: ended - duration * 1000,
      gameEndTimestamp: ended,
      teams: [
        { teamId: 100, win: masterWins },
        { teamId: 200, win: !masterWins },
      ],
      participants,
    },
  }
})

const entry = (queueType, e) => e && { queueType, tier: e[0], rank: e[1], leaguePoints: e[2], wins: e[3], losses: e[4] }
let calls = 0

const routes = [
  [
    /\/riot\/account\/v1\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/,
    (m) => {
      const name = decodeURIComponent(m[1]).toLowerCase()
      const hit = Object.entries(players).find(([, p]) => p.name.toLowerCase() === name)
      return hit ? { puuid: hit[0], gameName: hit[1].name, tagLine: hit[1].tag } : null
    },
  ],
  [/\/riot\/account\/v1\/accounts\/by-puuid\/([^/?]+)/, (m) => ({ puuid: m[1], gameName: players[m[1]].name, tagLine: players[m[1]].tag })],
  [/\/lol\/summoner\/v4\/summoners\/by-puuid\//, () => ({ profileIconId: 588, summonerLevel: 321 })],
  [
    /\/lol\/league\/v4\/entries\/by-puuid\/([^/?]+)/,
    (m) => [entry('RANKED_SOLO_5x5', players[m[1]].solo), entry('RANKED_FLEX_SR', players[m[1]].flex)].filter(Boolean),
  ],
  [
    /\/lol\/spectator\/v5\/active-games\/by-summoner\/([^/?]+)/,
    (m) =>
      m[1] !== 'fake-duo'
        ? null
        : {
            gameStartTime: now - 12 * 60_000,
            gameQueueConfigId: 420,
            participants: Array.from({ length: 10 }, (_, p) => ({
              puuid: p === 0 ? 'fake-duo' : null,
              riotId: p === 0 ? 'Fake Duo#BR1' : `Stranger ${p}#XYZ`,
              championId: CHAMPS[p],
              teamId: p < 5 ? 100 : 200,
              spell1Id: 4,
              spell2Id: 14,
            })),
          },
  ],
  [
    /\/lol\/match\/v5\/matches\/by-puuid\/([^/?]+)\/ids\?(.*)$/,
    (m) => {
      const q = new URLSearchParams(m[2])
      const queue = q.get('queue') ? Number(q.get('queue')) : null
      const since = q.get('startTime') ? Number(q.get('startTime')) * 1000 : 0
      return matches
        .filter((x) => x.info.participants.some((p) => p.puuid === m[1]))
        .filter((x) => (queue ? x.info.queueId === queue : true) && x.info.gameStartTimestamp >= since)
        .map((x) => x.metadata.matchId)
        .slice(0, Number(q.get('count') ?? 20))
    },
  ],
  [/\/lol\/match\/v5\/matches\/([^/?]+)$/, (m) => matches.find((x) => x.metadata.matchId === m[1]) ?? null],
]

createServer((req, res) => {
  calls++
  const stale = req.url.match(/by-(?:puuid|summoner)\/([^/?]+)/)
  if (stale && !players[stale[1]]) {
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
