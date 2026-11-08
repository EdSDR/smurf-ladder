/**
 * "Remember this device": keeps the member's private key in IndexedDB as a non-extractable
 * CryptoKey. Scripts on the page can use it but can never read its bytes.
 */
const DB_NAME = 'smurf-ladder'
const STORE = 'keys'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const keyName = (memberId: number, publicKey: string) => `member:${memberId}:${publicKey.slice(-24)}`

export async function loadPrivateKey(memberId: number, publicKey: string): Promise<CryptoKey | null> {
  try {
    return (await tx<CryptoKey | undefined>('readonly', (s) => s.get(keyName(memberId, publicKey)))) ?? null
  } catch {
    return null
  }
}

export async function savePrivateKey(memberId: number, publicKey: string, key: CryptoKey) {
  try {
    await tx('readwrite', (s) => s.put(key, keyName(memberId, publicKey)))
  } catch {
    // Private windows can block IndexedDB; the vault then just asks for the passphrase each visit.
  }
}

/** Drops this member's remembered private key but keeps the trusted group-key fingerprint. */
export async function forgetPrivateKey(memberId: number) {
  const prefix = `member:${memberId}:`
  try {
    await tx('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)))
  } catch {}
}

export async function forgetKeys() {
  try {
    await tx('readwrite', (s) => s.clear())
  } catch {}
}

/**
 * The group-key fingerprint this browser has trusted. A different key at the same version means
 * the server swapped it, so the vault refuses it instead of encrypting new logins under it.
 */
export type GroupPin = { version: number; fingerprint: string }

export async function loadGroupPin(memberId: number): Promise<GroupPin | null> {
  try {
    return (await tx<GroupPin | undefined>('readonly', (s) => s.get(`group:${memberId}`))) ?? null
  } catch {
    return null
  }
}

export async function saveGroupPin(memberId: number, pin: GroupPin) {
  try {
    await tx('readwrite', (s) => s.put(pin, `group:${memberId}`))
  } catch {}
}
