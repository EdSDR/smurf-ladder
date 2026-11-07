import type { z } from 'zod'
import { UserError } from './errors'

/**
 * Wraps a Zod schema as a server-function validator whose failures read like the rest of the
 * app ("Discord user IDs are 15–21 digits.") instead of a JSON dump of issues.
 */
export function input<T extends z.ZodType>(schema: T) {
  return (data: z.input<T>): z.output<T> => {
    const result = schema.safeParse(data)
    if (!result.success) throw new UserError(result.error.issues[0]?.message ?? 'Check the form and try again.')
    return result.data
  }
}
