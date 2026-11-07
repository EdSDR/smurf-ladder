import { describe, expect, it } from 'vitest'
import {
  WrongPassphraseError,
  createMemberKeys,
  decryptJson,
  encryptJson,
  fingerprint,
  generateAesKey,
  openPrivateKey,
  unwrapWithPrivateKey,
  wrapForMember,
} from '#/vault/crypto'
import { openCredential, sealCredential } from '#/vault/credentials'

const cred = { login: 'smurf_login', password: 'hunter2!', note: '2FA on Lia’s phone' }

describe('member keys', () => {
  it('reopens the private key with the right passphrase only', async () => {
    const { bundle } = await createMemberKeys('correct horse battery')
    expect(bundle.kdfIters).toBeGreaterThanOrEqual(600_000)
    const key = await openPrivateKey('correct horse battery', bundle)
    expect(key.extractable).toBe(false)
    await expect(openPrivateKey('wrong passphrase!!', bundle)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('stores nothing readable in the bundle', async () => {
    const { bundle } = await createMemberKeys('correct horse battery')
    expect(JSON.stringify(bundle)).not.toContain('correct horse battery')
  })

  it('gives a stable, short fingerprint', async () => {
    const { bundle } = await createMemberKeys('correct horse battery')
    const fp = await fingerprint(bundle.publicKey)
    expect(fp).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/)
    expect(await fingerprint(bundle.publicKey)).toBe(fp)
  })
})

describe('credentials', () => {
  it('shares through the group key with an approved member', async () => {
    const alice = await createMemberKeys('alice passphrase')
    const bob = await createMemberKeys('bob passphrase')
    const group = await generateAesKey()

    // Alice approves Bob: wraps the group key to his public key.
    const bobGroupKey = await unwrapWithPrivateKey(await wrapForMember(group, bob.bundle.publicKey), bob.privateKey)

    const sealed = await sealCredential(cred, true, { privateKey: alice.privateKey, publicKey: alice.bundle.publicKey, groupKey: group, groupVersion: 1 })
    expect(sealed.keyRef).toBe('group:1')
    expect(sealed.ciphertext).not.toContain('hunter2')
    expect(await openCredential(sealed, { privateKey: bob.privateKey, groupKey: bobGroupKey, groupVersion: 1 })).toEqual(cred)
  })

  it('keeps private logins readable by the owner only', async () => {
    const alice = await createMemberKeys('alice passphrase')
    const bob = await createMemberKeys('bob passphrase')
    const group = await generateAesKey()
    const sealed = await sealCredential(cred, false, { privateKey: alice.privateKey, publicKey: alice.bundle.publicKey, groupKey: group, groupVersion: 1 })
    expect(sealed.keyRef).toBe('owner')
    expect(await openCredential(sealed, { privateKey: alice.privateKey, groupKey: null, groupVersion: 1 })).toEqual(cred)
    await expect(openCredential(sealed, { privateKey: bob.privateKey, groupKey: group, groupVersion: 1 })).rejects.toThrow()
  })

  it('refuses shared logins to a member without group access', async () => {
    const alice = await createMemberKeys('alice passphrase')
    const group = await generateAesKey()
    const sealed = await sealCredential(cred, true, { privateKey: alice.privateKey, publicKey: alice.bundle.publicKey, groupKey: group, groupVersion: 1 })
    await expect(openCredential(sealed, { privateKey: alice.privateKey, groupKey: null, groupVersion: 1 })).rejects.toThrow(/approve/)
  })

  it('rotation leaves the old group key useless', async () => {
    const oldKey = await generateAesKey()
    const newKey = await generateAesKey()
    const v1 = await encryptJson(cred, oldKey)
    const v2 = await encryptJson(await decryptJson(v1.ciphertext, v1.iv, oldKey), newKey)
    expect(await decryptJson(v2.ciphertext, v2.iv, newKey)).toEqual(cred)
    await expect(decryptJson(v2.ciphertext, v2.iv, oldKey)).rejects.toThrow()
  })
})
