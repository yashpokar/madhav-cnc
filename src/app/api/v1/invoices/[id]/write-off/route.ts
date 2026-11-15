import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { writeOffBody } from '@/lib/api/schemas/sales'
import { actorOf, must, saved } from '@/lib/api/writes'
import { writeOffInvoice } from '@/lib/services/invoices'

/** Writes off part of what is due (a discount or a bad debt). Answers the invoice (201). */
export const POST = apiRoute(
  { auth: 'company', capability: 'payment:update', body: writeOffBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await writeOffInvoice(actorOf(user), params.id, body))

    return saved(await invoiceDetailFor(params.id), 201)
  },
)
