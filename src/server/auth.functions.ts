import { createServerFn } from '@tanstack/react-start'
import { destroySession, getSessionMember } from './session'

export type Me = { id: number; name: string | null; avatar: string | null; role: 'admin' | 'member'; hasVault: boolean }

export const getMe = createServerFn({ method: 'GET' }).handler(async (): Promise<Me | null> => {
  const m = await getSessionMember()
  return m ? { id: m.id, name: m.name, avatar: m.avatar, role: m.role, hasVault: !!m.publicKey } : null
})

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  await destroySession()
})
