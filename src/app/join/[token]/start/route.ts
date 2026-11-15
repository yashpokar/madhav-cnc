import { NextResponse, type NextRequest } from 'next/server'
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE } from '@/lib/invite-cookie'
import { isPlausibleToken } from '@/lib/invite-rules'

/**
 * Remembers the invitation in a short-lived HttpOnly cookie and sends the
 * person on to create an account or sign in. The cookie survives the Google
 * round trip, which drops query strings. A page cannot set cookies while it
 * renders, so the join page's buttons point here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const to = request.nextUrl.searchParams.get('to') === 'sign-in' ? '/sign-in' : '/sign-up'

  if (!isPlausibleToken(token)) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  const response = NextResponse.redirect(new URL(`${to}?invite=${token}`, request.url))

  response.cookies.set(INVITE_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: INVITE_COOKIE_MAX_AGE,
  })

  return response
}
