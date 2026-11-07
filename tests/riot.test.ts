import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ env: {} }))
const { parseRiotId } = await import('#/server/riot')

describe('parseRiotId', () => {
  it('splits name and tag, keeping spaces in the name', () => {
    expect(parseRiotId('  Noite de Rift#BR1 ')).toEqual({ gameName: 'Noite de Rift', tagLine: 'BR1' })
  })
  it('rejects missing or extra tags', () => {
    expect(parseRiotId('NoTag')).toBeNull()
    expect(parseRiotId('a#b#c')).toBeNull()
    expect(parseRiotId('#BR1')).toBeNull()
    expect(parseRiotId('name#toolongtag')).toBeNull()
  })
})
