/**
 * Idle lock: after 72 hours without using the site, the vault locks and this browser forgets the
 * remembered key, so the next login needs the passphrase again. The rest of the site keeps working.
 * The timestamp lives in localStorage so activity in any tab counts.
 */
export const IDLE_LOCK_MS = 72 * 60 * 60 * 1000

const storageKey = (memberId: number) => `smurf-ladder:vault-active:${memberId}`

export function lastActive(memberId: number): number | null {
  try {
    const v = Number(localStorage.getItem(storageKey(memberId)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function markActive(memberId: number, now = Date.now()) {
  try {
    localStorage.setItem(storageKey(memberId), String(now))
  } catch {}
}

/** No timestamp yet (a browser from before the idle lock) counts as active, not expired. */
export function idleExpired(last: number | null, now = Date.now()) {
  return last != null && now - last > IDLE_LOCK_MS
}
