import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const GUEST_ROUTES = ['/sign-in', '/sign-up']
const OPEN_ROUTES = ['/pending']

function matches(pathname: string, routes: readonly string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(getSessionCookie(request))

  if (matches(pathname, OPEN_ROUTES)) {
    return NextResponse.next()
  }

  const isGuestRoute = matches(pathname, GUEST_ROUTES)

  if (!hasSession && !isGuestRoute) {
    const signInUrl = new URL('/sign-in', request.url)

    if (pathname !== '/') {
      signInUrl.searchParams.set('next', pathname)
    }

    return NextResponse.redirect(signInUrl)
  }

  if (hasSession && isGuestRoute) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
}
