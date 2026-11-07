import { createMiddleware } from '@tanstack/react-start'
import { getSessionMember } from './session'

export class AuthError extends Error {}

/** Server functions behind this middleware get `context.member` and reject anonymous calls. */
export const memberMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const member = await getSessionMember()
  if (!member) throw new AuthError('Sign in with Discord to do that.')
  return next({ context: { member } })
})

export const adminMiddleware = createMiddleware({ type: 'function' })
  .middleware([memberMiddleware])
  .server(async ({ next, context }) => {
    if (context.member.role !== 'admin') throw new AuthError('Only admins can do that.')
    return next()
  })
