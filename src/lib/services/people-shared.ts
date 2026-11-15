// Types shared by the customer, item, partner, vendor and material services.
// Services never touch cookies, headers, redirects or revalidatePath: callers
// (web actions, API handlers) decide who is acting and what happens next.

import type { ApiErrorCode } from '@/lib/api/errors'

/** The signed-in person doing the work, for audit columns and activity lines. */
export type Actor = { id: string; name: string }

/**
 * A business-rule refusal. `error` is written for a person. `code` is the
 * API error code a handler should use (see unwrapService in api/errors).
 */
export type Failure = {
  ok: false
  error: string
  code: Extract<ApiErrorCode, 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED'>
  fieldErrors?: Record<string, string>
  /** Set on duplicates: the record the person can open instead. */
  existingId?: string
}

export function fail(
  error: string,
  code: Failure['code'] = 'CONFLICT',
  extra: { fieldErrors?: Record<string, string>; existingId?: string } = {},
): Failure {
  return { ok: false, error, code, ...extra }
}
