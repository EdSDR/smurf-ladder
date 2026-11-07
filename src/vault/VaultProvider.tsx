import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getVaultState, setupVault } from '#/server/vault.functions'
import { createMemberKeys, generateAesKey, openPrivateKey, unwrapWithPrivateKey, wrapForMember } from './crypto'
import { forgetKeys, loadPrivateKey, savePrivateKey } from './keystore'
import type { SealedCredential } from './credentials'
import { openCredential, sealCredential } from './credentials'
import type { Credential } from './crypto'

type VaultState = Awaited<ReturnType<typeof getVaultState>>

export type VaultStatus = 'signed-out' | 'loading' | 'no-vault' | 'locked' | 'unlocked'

type Unlocked = { privateKey: CryptoKey; groupKey: CryptoKey | null }

type VaultContextValue = {
  status: VaultStatus
  /** The member's public key (base64 SPKI), once they have a vault. */
  publicKey: string | null
  groupVersion: number | null
  hasGroupAccess: boolean
  groupKey: CryptoKey | null
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

  const openGroupKey = useCallback(async (s: VaultState, privateKey: CryptoKey) => {
    if (!s.wrappedGroupKey) return null
    try {
      return await unwrapWithPrivateKey(s.wrappedGroupKey, privateKey)
    } catch {
      return null
    }
  }, [])

  const reload = useCallback(async () => {
    if (!memberId) return
    const s = await getVaultState()
    setState(s)
    if (!s.keys) {
      setKeys(null)
      return
    }
    // Reuse the in-memory key, else a remembered one; otherwise the vault stays locked.
    const privateKey = keysRef.current?.privateKey ?? (await loadPrivateKey(memberId, s.keys.publicKey))
    if (privateKey) setKeys({ privateKey, groupKey: await openGroupKey(s, privateKey) })
  }, [memberId, openGroupKey, setKeys])

  useEffect(() => {
    if (!memberId) return
    setLoading(true)
    reload().finally(() => setLoading(false))
  }, [memberId, reload])

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
        if (remember) await savePrivateKey(memberId, bundle.publicKey, privateKey)
        setKeys({ privateKey, groupKey })
        setState(await getVaultState())
      },
      async unlock(passphrase, remember) {
        if (!memberId || !state?.keys) throw new Error('Set up your vault first.')
        const privateKey = await openPrivateKey(passphrase, state.keys)
        if (remember) await savePrivateKey(memberId, state.keys.publicKey, privateKey)
        setKeys({ privateKey, groupKey: await openGroupKey(state, privateKey) })
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
