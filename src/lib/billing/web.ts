// For the web server actions: turns the guard's PLAN_LIMIT_REACHED error into
// the friendly message and the page to fix it on. Anything else is rethrown by
// the caller (it is a bug, not a business rule).

import { DomainError } from '@/lib/api/errors'
import { PLAN_LIMIT_MESSAGE } from '@/lib/billing/guard'

export const BILLING_PAGE = '/settings/billing'

/** The paywall message for a PLAN_LIMIT_REACHED error, or null for any other error. */
export function planLimitMessage(error: unknown): string | null {
  if (error instanceof DomainError && error.code === 'PLAN_LIMIT_REACHED') {
    return error.message || PLAN_LIMIT_MESSAGE
  }

  return null
}
