import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { invoicePaymentBody } from '@/lib/api/schemas/sales'
import { actorOf, must, saved } from '@/lib/api/writes'
import { recordInvoicePayment } from '@/lib/services/invoices'

/** Records a receipt straight against this invoice. Answers the invoice (201). */
export const POST = apiRoute(
  { auth: 'company', capability: 'payment:create', body: invoicePaymentBody, idempotent: true },
  async ({ params, body, user }) => {
    const { methodId, ...rest } = body

    must(await recordInvoicePayment(actorOf(user), params.id, { ...rest, channelId: methodId }))

    return saved(await invoiceDetailFor(params.id), 201)
  },
)
