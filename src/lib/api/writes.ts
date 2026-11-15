import { ApiError, ERROR_STATUS, type ApiErrorCode } from '@/lib/api/errors'
import type { ApiUser } from '@/lib/api/auth'
import { reply } from '@/lib/api/handler'
import { etagOf } from '@/lib/api/etag'

// Helpers every write endpoint shares: who is acting, how a service refusal
// becomes an error, and the reply (the saved resource, with its ETag).

/** `{ id, name }`: invoices, people and production services. */
export const actorOf = (user: ApiUser) => ({ id: user.id, name: user.name })

/** `{ userId, name }`: quotation, order, payment and expense services. */
export const userActorOf = (user: ApiUser) => ({ userId: user.id, name: user.name })

/** Production also needs the role in the company (only an administrator may start a stage out of order). */
export const productionActorOf = (user: ApiUser) => ({ id: user.id, name: user.name, role: user.role })

type Refusal = {
  ok: false
  error: string
  code?: ApiErrorCode
  fieldErrors?: Record<string, string>
}

const NOT_FOUND_TEXT = /\bnot found\b/i
const BAD_REFERENCE_TEXT =
  /no longer exists|is not an? (architect|carpenter)|must be an? (architect|carpenter)|not part of this company/i

/** Which API error a service refusal is. Services that name a code win; the rest are read from the message. */
export function refusalCode(result: Refusal): ApiErrorCode {
  // A service-specific code that is not an API code (e.g. NEGATIVE_STOCK) is a state conflict.
  if (result.code) return result.code in ERROR_STATUS ? result.code : 'CONFLICT'

  if (NOT_FOUND_TEXT.test(result.error)) return 'NOT_FOUND'

  if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) return 'VALIDATION_FAILED'

  if (BAD_REFERENCE_TEXT.test(result.error)) return 'VALIDATION_FAILED'

  return 'CONFLICT'
}

/**
 * Unwraps a service result: `{ ok: true }` is returned as it is, a refusal is
 * thrown as the matching ApiError (NOT_FOUND, VALIDATION_FAILED with `fields`,
 * or CONFLICT), carrying the message written for a person.
 */
export function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (result.ok) return result as Extract<T, { ok: true }>

  const refusal = result as unknown as Refusal
  const code = refusalCode(refusal)

  throw new ApiError(
    code,
    refusal.error,
    code === 'VALIDATION_FAILED' ? { fields: refusal.fieldErrors ?? { _: refusal.error } } : {},
  )
}

/** The saved resource with its ETag (201 for a create). */
export function saved(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return reply(data, { status, headers: { ETag: etagOf(data) }, ...(meta ? { meta } : {}) })
}
