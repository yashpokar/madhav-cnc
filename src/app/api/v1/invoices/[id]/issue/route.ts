import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { actorOf, must, saved } from '@/lib/api/writes'
import { changeInvoiceStatus } from '@/lib/services/invoices'

/**
 * Issues a draft invoice. This is the one step the plan limit guards: a Free
 * company that has used its free invoices gets 402 PLAN_LIMIT_REACHED (while
 * BILLING_ENFORCED is on); everything else keeps working.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'invoice:update', idempotent: true },
  async ({ params, user }) => {
    must(await changeInvoiceStatus(actorOf(user), params.id, 'ISSUED'))

    return saved(await invoiceDetailFor(params.id))
  },
)
