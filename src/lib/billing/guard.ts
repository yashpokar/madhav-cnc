// The enforcement hook for issuing invoices. Call it before every
// DRAFT -> ISSUED move (see docs/billing.md for the exact call sites).
// While BILLING_ENFORCED is not 'true' it never blocks.

import { DomainError } from '@/lib/api/errors'
import { PLANS } from '@/lib/billing/plans'
import { getBillingSnapshot } from '@/lib/services/billing'

export const PLAN_LIMIT_MESSAGE =
  'You have used your free invoices. Choose a plan to issue more; everything else keeps working.'

/**
 * Throws DomainError('PLAN_LIMIT_REACHED', HTTP 402) when the company may not
 * issue another invoice. Reading, editing, printing, sharing and recording
 * payments are never guarded. `count` is how many invoices this call is about
 * to issue (default 1).
 */
export async function assertCanIssueInvoice(companyId: string, count = 1): Promise<void> {
  const snapshot = await getBillingSnapshot(companyId)
  const { entitlements, enforced, decision } = snapshot

  if (!enforced || entitlements.invoiceQuota === null) return

  if (decision.used + count > entitlements.invoiceQuota) {
    throw new DomainError(
      `${PLAN_LIMIT_MESSAGE} (${decision.used} of ${entitlements.invoiceQuota} used on ${PLANS[entitlements.plan].name})`,
      'PLAN_LIMIT_REACHED',
    )
  }
}
