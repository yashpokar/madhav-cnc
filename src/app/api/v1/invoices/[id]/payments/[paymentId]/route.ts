import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { requireAllocation } from '@/lib/api/sales-helpers'
import { actorOf, must, saved } from '@/lib/api/writes'
import { removePaymentAllocation } from '@/lib/services/invoices'

/**
 * Unapplies a payment (a `paymentId` in the invoice's payments) from this invoice; the last
 * allocation removes the receipt. Answers the invoice.
 */
export const DELETE = apiRoute({ auth: 'company', capability: 'payment:delete' }, async ({ params, user }) => {
  const allocationId = await requireAllocation(params.id, params.paymentId)

  must(await removePaymentAllocation(actorOf(user), allocationId))

  return saved(await invoiceDetailFor(params.id))
})
