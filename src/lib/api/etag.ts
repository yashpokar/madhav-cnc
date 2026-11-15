import { createHash } from 'node:crypto'
import { ApiError } from '@/lib/api/errors'

/** A strong validator for a JSON value (stable for equal content). */
export function etagOf(value: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 27)}"`
}

function tags(header: string | null): string[] {
  return (header ?? '')
    .split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .filter(Boolean)
}

/** True when the client's If-None-Match already holds this version (answer 304). */
export function matchesIfNoneMatch(request: Request, etag: string): boolean {
  const given = tags(request.headers.get('if-none-match'))

  return given.includes('*') || given.includes(etag)
}

/**
 * For updates: refuses with 412 when the client sent If-Match for a version
 * that is no longer current. A request without If-Match is allowed through.
 */
export function assertIfMatch(request: Request, currentEtag: string): void {
  const header = request.headers.get('if-match')

  if (header === null) return

  const given = tags(header)

  if (!given.includes('*') && !given.includes(currentEtag)) {
    throw new ApiError('PRECONDITION_FAILED', 'This record changed since you loaded it. Refresh and try again.')
  }
}
