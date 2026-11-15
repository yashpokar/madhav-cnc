import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { actorOf, must, saved } from '@/lib/api/writes'
import { changeInvoiceStatus } from '@/lib/services/invoices'

/** Cancels an invoice. Refused (409) while payments are applied to it. Never guarded by the plan, and it does not free a slot. */
export const POST = apiRoute(
  { auth: 'company', capability: 'invoice:update', idempotent: true },
  async ({ params, user }) => {
    must(await changeInvoiceStatus(actorOf(user), params.id, 'CANCELLED'))

    return saved(await invoiceDetailFor(params.id))
  },
)
