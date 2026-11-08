import { describe, expect, it } from 'vitest'
import { IDLE_LOCK_MS, idleExpired } from '#/vault/idle'

describe('vault idle lock', () => {
  const now = Date.UTC(2026, 10, 8)
  it('locks after 72 hours without activity', () => {
    expect(idleExpired(now - IDLE_LOCK_MS - 1, now)).toBe(true)
    expect(idleExpired(now - IDLE_LOCK_MS + 60_000, now)).toBe(false)
  })
  it('treats a browser with no recorded activity as active', () => {
    expect(idleExpired(null, now)).toBe(false)
  })
})
