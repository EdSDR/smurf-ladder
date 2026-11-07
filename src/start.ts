import { createMiddleware, createStart } from '@tanstack/react-start'
import { UserError } from './lib/errors'

const GENERIC = 'Something went wrong on our side. Try again in a moment.'

/** Runs around every server function: lets UserErrors through and hides everything else. */
const hideInternalErrors = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (err) {
    if (err instanceof UserError) throw err
    // Redirects and not-found signals from the router are control flow, not failures.
    if (err && typeof err === 'object' && ('isRedirect' in err || 'isNotFound' in err || err instanceof Response)) throw err
    console.error(err)
    throw new Error(GENERIC)
  }
})

export const startInstance = createStart(() => ({
  functionMiddleware: [hideInternalErrors],
}))
