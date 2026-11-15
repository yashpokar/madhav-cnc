import { cookies } from 'next/headers'
import { isPlausibleToken } from '@/lib/invite-rules'

/**
 * Short-lived HttpOnly cookie that remembers which invitation a person is
 * working through while they sign up or sign in (Google sign-in loses the query
 * string on its round trip). Set by /join/[token]/start.
 */
export const INVITE_COOKIE = 'invite_token'
export const INVITE_COOKIE_MAX_AGE = 60 * 60 * 2

/** The pending invite token from the URL or the cookie, if it is well formed. */
export async function pendingInviteToken(fromQuery?: unknown): Promise<string | null> {
  if (isPlausibleToken(fromQuery)) return fromQuery

  const stored = (await cookies()).get(INVITE_COOKIE)?.value

  return isPlausibleToken(stored) ? stored : null
}

/** Where someone with an invite should land to finish joining. */
export function joinPath(token: string): string {
  return `/join/${token}?auto=1`
}
