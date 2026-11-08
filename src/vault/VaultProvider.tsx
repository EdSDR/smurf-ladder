import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getVaultState, setupVault } from '#/server/vault.functions'
import { createMemberKeys, generateAesKey, groupKeyFingerprint, keysMatch, openPrivateKey, unwrapWithPrivateKey, wrapForMember } from './crypto'
import { idleExpired, lastActive, markActive } from './idle'
import { forgetKeys, forgetPrivateKey, loadGroupPin, loadPrivateKey, saveGroupPin, savePrivateKey } from './keystore'
import type { SealedCredential } from './credentials'
import { openCredential, sealCredential } from './credentials'
import type { Credential } from './crypto'

type VaultState = Awaited<ReturnType<typeof getVaultState>>

export type VaultStatus = 'signed-out' | 'loading' | 'no-vault' | 'locked' | 'unlocked'

/**
 * - new: first time this browser sees the group key; compare its fingerprint with the group once.
 * - rotated: the key changed with a version bump (a member was removed); compare again.
 * - mismatch: a different key at the same version. Refused, because the server may have swapped it.
 */
export type GroupKeyAlert = 'new' | 'rotated' | 'mismatch' | null

type Unlocked = { privateKey: CryptoKey; groupKey: CryptoKey | null; groupFingerprint: string | null; groupAlert: GroupKeyAlert }

type VaultContextValue = {
  status: VaultStatus
  /** The member's public key (base64 SPKI), once they have a vault. */
  publicKey: string | null
  groupVersion: number | null
  hasGroupAccess: boolean
  groupKey: CryptoKey | null
  groupFingerprint: string | null
  groupAlert: GroupKeyAlert
  /** After checking the fingerprint with the group: trust the key the server now offers. */
  trustGroupKey: () => Promise<void>
  setup: (passphrase: string, remember: boolean) => Promise<void>
  unlock: (passphrase: string, remember: boolean) => Promise<void>
  lock: (forgetDevice?: boolean) => Promise<void>
  reload: () => Promise<void>
  seal: (cred: Credential, shared: boolean) => Promise<SealedCredential>
  open: (sealed: SealedCredential) => Promise<Credential>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ memberId, children }: { memberId: number | null; children: React.ReactNode }) {
  const [state, setState] = useState<VaultState | null>(null)
  const [keys, setKeysState] = useState<Unlocked | null>(null)
  const keysRef = useRef<Unlocked | null>(null)
  const setKeys = useCallback((k: Unlocked | null) => {
    keysRef.current = k
    setKeysState(k)
  }, [])
  const [loading, setLoading] = useState(!!memberId)

  /** Unwraps the group key and checks it against the fingerprint this browser trusted before. */
  const openGroupKey = useCallback(
    async (s: VaultState, privateKey: CryptoKey, trustNew = false): Promise<Omit<Unlocked, 'privateKey'>> => {
      const none = { groupKey: null, groupFingerprint: null, groupAlert: null }
      if (!s.wrappedGroupKey || s.groupVersion === null || !memberId) return none
      let groupKey: CryptoKey
      try {
        groupKey = await unwrapWithPrivateKey(s.wrappedGroupKey, privateKey, true)
      } catch {
        return none
      }
      const fp = await groupKeyFingerprint(groupKey)
      const pin = await loadGroupPin(memberId)
      const current = { version: s.groupVersion, fingerprint: fp }
      if (!pin || trustNew) {
        await saveGroupPin(memberId, current)
        return { groupKey, groupFingerprint: fp, groupAlert: trustNew ? null : 'new' }
      }
      if (pin.fingerprint === fp) return { groupKey, groupFingerprint: fp, groupAlert: null }
      if (s.groupVersion > pin.version) {
        await saveGroupPin(memberId, current)
        return { groupKey, groupFingerprint: fp, groupAlert: 'rotated' }
      }
      return { groupKey: null, groupFingerprint: fp, groupAlert: 'mismatch' }
    },
    [memberId],
  )

  const reload = useCallback(async () => {
    if (!memberId) return
    const s = await getVaultState()
    setState(s)
    if (!s.keys) {
      setKeys(null)
      return
    }
    // After 72 idle hours the remembered key is dropped and the passphrase is needed again.
    if (idleExpired(lastActive(memberId))) {
      await forgetPrivateKey(memberId)
      setKeys(null)
      return
    }
    // Reuse the in-memory key, else a remembered one; otherwise the vault stays locked.
    const privateKey = keysRef.current?.privateKey ?? (await loadPrivateKey(memberId, s.keys.publicKey))
    if (privateKey && (await keysMatch(s.keys.publicKey, privateKey))) {
      setKeys({ privateKey, ...(await openGroupKey(s, privateKey)) })
    } else {
      setKeys(null)
    }
  }, [memberId, openGroupKey, setKeys])

  useEffect(() => {
    if (!memberId) return
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [memberId, reload])

  // While unlocked, any interaction counts as activity. Each check first locks if the vault has
  // already been idle too long (e.g. a tab left open for days), then records the activity.
  const unlocked = !!keys
  useEffect(() => {
    if (!memberId || !unlocked) return
    let written = 0
    const check = (active: boolean) => {
      const now = Date.now()
      if (idleExpired(lastActive(memberId), now)) {
        setKeys(null)
        void forgetPrivateKey(memberId)
        return
      }
      if (active && now - written > 60_000) {
        written = now
        markActive(memberId, now)
      }
    }
    const onActivity = () => check(document.visibilityState === 'visible')
    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const timer = setInterval(() => check(false), 60_000)
    check(true)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(timer)
    }
  }, [memberId, unlocked, setKeys])

  const value = useMemo<VaultContextValue>(() => {
    const status: VaultStatus = !memberId
      ? 'signed-out'
      : loading || !state
        ? 'loading'
        : !state.keys
          ? 'no-vault'
          : keys
            ? 'unlocked'
            : 'locked'

    const requireKeys = () => {
      if (!keys || !state?.keys) throw new Error('Unlock your vault first.')
      return { privateKey: keys.privateKey, groupKey: keys.groupKey, publicKey: state.keys.publicKey, groupVersion: state.groupVersion }
    }

    return {
      status,
      publicKey: state?.keys?.publicKey ?? null,
      groupVersion: state?.groupVersion ?? null,
      hasGroupAccess: !!keys?.groupKey,
      groupKey: keys?.groupKey ?? null,
      groupFingerprint: keys?.groupFingerprint ?? null,
      groupAlert: keys?.groupAlert ?? null,
      async trustGroupKey() {
        if (!keys || !state) return
        setKeys({ privateKey: keys.privateKey, ...(await openGroupKey(state, keys.privateKey, true)) })
      },
      reload,
      async setup(passphrase, remember) {
        if (!memberId) throw new Error('Sign in first.')
        const { bundle, privateKey, publicKey } = await createMemberKeys(passphrase)
        // The very first vault creates the group key and grants it to its creator.
        let groupKey: CryptoKey | null = null
        let wrappedGroupKey: string | null = null
        if (state?.groupVersion == null) {
          groupKey = await generateAesKey()
          wrappedGroupKey = await wrapForMember(groupKey, publicKey)
        }
        await setupVault({ data: { ...bundle, wrappedGroupKey } })
        markActive(memberId)
        if (remember) await savePrivateKey(memberId, bundle.publicKey, privateKey)
        const fresh = await getVaultState()
        setState(fresh)
        if (groupKey) {
          const fp = await groupKeyFingerprint(groupKey)
          await saveGroupPin(memberId, { version: fresh.groupVersion ?? 1, fingerprint: fp })
          setKeys({ privateKey, groupKey, groupFingerprint: fp, groupAlert: null })
        } else {
          setKeys({ privateKey, groupKey: null, groupFingerprint: null, groupAlert: null })
        }
      },
      async unlock(passphrase, remember) {
        if (!memberId || !state?.keys) throw new Error('Set up your vault first.')
        const privateKey = await openPrivateKey(passphrase, state.keys)
        if (!(await keysMatch(state.keys.publicKey, privateKey))) {
          throw new Error('Your vault keys don’t match what the server sent. Don’t save logins until an admin checks the deployment.')
        }
        markActive(memberId)
        if (remember) await savePrivateKey(memberId, state.keys.publicKey, privateKey)
        setKeys({ privateKey, ...(await openGroupKey(state, privateKey)) })
      },
      async lock(forgetDevice = false) {
        if (forgetDevice) await forgetKeys()
        setKeys(null)
      },
      seal: (cred, shared) => sealCredential(cred, shared, requireKeys()),
      open: (sealed) => openCredential(sealed, requireKeys()),
    }
  }, [memberId, loading, state, keys, reload, openGroupKey, setKeys])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used inside VaultProvider')
  return ctx
}
