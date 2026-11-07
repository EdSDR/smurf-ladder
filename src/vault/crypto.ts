/**
 * Zero-knowledge vault primitives. Everything here runs in the browser (or tests) with WebCrypto;
 * the server only ever stores the base64 outputs.
 *
 *   passphrase ──PBKDF2──▶ KEK ──wraps──▶ member RSA private key
 *   member RSA public key ──wraps──▶ group AES key  (shared logins)
 *   owner RSA public key  ──wraps──▶ item AES key   (private logins)
 */

export const KDF_ITERATIONS = 600_000
const RSA: RsaHashedKeyGenParams = { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
const RSA_IMPORT: RsaHashedImportParams = { name: 'RSA-OAEP', hash: 'SHA-256' }
const AES = { name: 'AES-GCM', length: 256 } as const

const subtle = () => globalThis.crypto.subtle

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))

export async function deriveKek(passphrase: string, saltB64: string, iterations: number) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    AES,
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

export type MemberKeyBundle = {
  publicKey: string
  wrappedPrivateKey: string
  kdfSalt: string
  kdfIters: number
  wrapIv: string
}

/** Creates a member keypair and seals the private half with the passphrase. */
export async function createMemberKeys(passphrase: string): Promise<{ bundle: MemberKeyBundle; privateKey: CryptoKey; publicKey: CryptoKey }> {
  const pair = await subtle().generateKey(RSA, true, ['wrapKey', 'unwrapKey'])
  const kdfSalt = toB64(randomBytes(16))
  const kek = await deriveKek(passphrase, kdfSalt, KDF_ITERATIONS)
  const iv = randomBytes(12)
  const wrapped = await subtle().wrapKey('pkcs8', pair.privateKey, kek, { name: 'AES-GCM', iv })
  const spki = await subtle().exportKey('spki', pair.publicKey)
  // Re-import so the in-memory private key is non-extractable from here on.
  const privateKey = await unwrapPrivateKey({ wrappedPrivateKey: toB64(wrapped), wrapIv: toB64(iv) }, kek)
  return {
    bundle: { publicKey: toB64(spki), wrappedPrivateKey: toB64(wrapped), kdfSalt, kdfIters: KDF_ITERATIONS, wrapIv: toB64(iv) },
    privateKey,
    publicKey: pair.publicKey,
  }
}

function unwrapPrivateKey(b: Pick<MemberKeyBundle, 'wrappedPrivateKey' | 'wrapIv'>, kek: CryptoKey) {
  return subtle().unwrapKey('pkcs8', fromB64(b.wrappedPrivateKey), kek, { name: 'AES-GCM', iv: fromB64(b.wrapIv) }, RSA_IMPORT, false, [
    'unwrapKey',
  ])
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase doesn't unlock your vault.")
  }
}

export async function openPrivateKey(passphrase: string, bundle: MemberKeyBundle): Promise<CryptoKey> {
  const kek = await deriveKek(passphrase, bundle.kdfSalt, bundle.kdfIters)
  try {
    return await unwrapPrivateKey(bundle, kek)
  } catch {
    throw new WrongPassphraseError()
  }
}

export function importPublicKey(spkiB64: string) {
  return subtle().importKey('spki', fromB64(spkiB64), RSA_IMPORT, true, ['wrapKey'])
}

/** Group keys stay extractable in memory so an unlocked member can wrap them for newcomers. */
export function generateAesKey() {
  return subtle().generateKey(AES, true, ['encrypt', 'decrypt'])
}

export async function wrapForMember(key: CryptoKey, publicKeySpki: string | CryptoKey): Promise<string> {
  const pub = typeof publicKeySpki === 'string' ? await importPublicKey(publicKeySpki) : publicKeySpki
  return toB64(await subtle().wrapKey('raw', key, pub, { name: 'RSA-OAEP' }))
}

export function unwrapWithPrivateKey(wrappedB64: string, privateKey: CryptoKey) {
  return subtle().unwrapKey('raw', fromB64(wrappedB64), privateKey, { name: 'RSA-OAEP' }, AES, true, ['encrypt', 'decrypt'])
}

export type Credential = { login: string; password: string; note?: string }

export async function encryptJson(value: unknown, key: CryptoKey) {
  const iv = randomBytes(12)
  const data = new TextEncoder().encode(JSON.stringify(value))
  return { ciphertext: toB64(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data)), iv: toB64(iv) }
}

export async function decryptJson<T>(ciphertext: string, iv: string, key: CryptoKey): Promise<T> {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext))
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

/** Short, human-comparable digest of a public key, read aloud or pasted in Discord before approving. */
export async function fingerprint(spkiB64: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', fromB64(spkiB64)))
  const hex = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return hex.match(/.{4}/g)!.join(' ')
}
