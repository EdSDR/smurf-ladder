/**
 * An error whose message is written for the person using the app. Only these messages reach the
 * browser; anything else (database errors, bugs) is logged server-side and replaced with a generic
 * message, so internals like SQL or parameters never leak.
 */
export class UserError extends Error {}
