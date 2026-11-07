import type { Credential } from './crypto'
import { decryptJson, encryptJson, generateAesKey, unwrapWithPrivateKey, wrapForMember } from './crypto'

export type SealedCredential = {
  ciphertext: string
  iv: string
  keyRef: string
  wrappedItemKey: string | null
}

type Keys = { privateKey: CryptoKey; publicKey: string; groupKey: CryptoKey | null; groupVersion: number | null }

/** Shared logins use the group key; private ones get their own key that only the owner can unwrap. */
export async function sealCredential(cred: Credential, shared: boolean, keys: Keys): Promise<SealedCredential> {
  if (shared) {
    if (!keys.groupKey || keys.groupVersion === null) throw new Error('You need group vault access before sharing a login.')
    return { ...(await encryptJson(cred, keys.groupKey)), keyRef: `group:${keys.groupVersion}`, wrappedItemKey: null }
  }
  const itemKey = await generateAesKey()
  return {
    ...(await encryptJson(cred, itemKey)),
    keyRef: 'owner',
    wrappedItemKey: await wrapForMember(itemKey, keys.publicKey),
  }
}

export async function openCredential(sealed: SealedCredential, keys: Pick<Keys, 'privateKey' | 'groupKey' | 'groupVersion'>): Promise<Credential> {
  if (sealed.keyRef === 'owner') {
    if (!sealed.wrappedItemKey) throw new Error('This login is missing its key.')
    const itemKey = await unwrapWithPrivateKey(sealed.wrappedItemKey, keys.privateKey)
    return decryptJson<Credential>(sealed.ciphertext, sealed.iv, itemKey)
  }
  if (!keys.groupKey || sealed.keyRef !== `group:${keys.groupVersion}`) {
    throw new Error('Your vault has no access to shared logins yet. Ask a member to approve you.')
  }
  return decryptJson<Credential>(sealed.ciphertext, sealed.iv, keys.groupKey)
}
