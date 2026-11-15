import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { actorOf, must, saved } from '@/lib/api/writes'
import { duplicateInvoice } from '@/lib/services/invoices'

/** A new draft with the same lines (no advance, dated today). 201, the new invoice. */
export const POST = apiRoute(
  { auth: 'company', capability: 'invoice:create', idempotent: true },
  async ({ params, user }) => {
    const created = must(await duplicateInvoice(actorOf(user), params.id))

    return saved(await invoiceDetailFor(created.id), 201)
  },
)
