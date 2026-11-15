import { headers } from 'next/headers'
import { BRAND } from '@/lib/brand'

/** Hosts a customer could never open: loopback, private ranges and .local names. */
export function isPrivateHost(hostWithPort: string): boolean {
  const host = hostWithPort.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '')

  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1' || host === '0.0.0.0') return true
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true

  return /^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

/**
 * The address customers should be sent to in shared links (quotations, order
 * tracking, invoices, team invitations).
 *
 * 1. PUBLIC_BASE_URL, when it is a valid http(s) URL.
 * 2. Otherwise the address the page was opened on, except in production when
 *    that is localhost or a private address (a customer can never open it).
 * 3. Otherwise, in production, the canonical Prodlys address. In development
 *    with nothing to go on: an empty string, so callers build a path only.
 */
export function pickPublicBaseUrl({
  env,
  host,
  proto,
  production,
}: {
  env?: string | null
  host?: string | null
  proto?: string | null
  production: boolean
}): string {
  const fromEnv = env?.trim()

  if (fromEnv) {
    try {
      const url = new URL(fromEnv)

      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`
      }
    } catch {
      // Not a URL: ignore it rather than build broken links.
    }
  }

  if (host && !(production && isPrivateHost(host))) {
    const scheme = proto?.split(',')[0].trim() || (isPrivateHost(host) ? 'http' : 'https')

    return `${scheme}://${host}`
  }

  return production ? BRAND.appUrl : ''
}

/** The shared-link base for the current request. Server components and server actions only. */
export async function getPublicBaseUrl(): Promise<string> {
  let host: string | null = null
  let proto: string | null = null

  try {
    const requestHeaders = await headers()

    host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
    proto = requestHeaders.get('x-forwarded-proto')
  } catch {
    // Called outside a request (scripts): fall back to the setting.
  }

  return pickPublicBaseUrl({
    env: process.env.PUBLIC_BASE_URL,
    host,
    proto,
    production: process.env.NODE_ENV === 'production',
  })
}
