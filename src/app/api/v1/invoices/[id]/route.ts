import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { invoiceDetailOut } from '@/lib/api/reads/mappers'
import { invoiceInputSchema } from '@/lib/api/schemas/writes'
import { actorOf, must, saved } from '@/lib/api/writes'
import { getInvoice } from '@/lib/queries/invoices'
import { updateInvoice } from '@/lib/services/invoices'

export const GET = apiRoute({ auth: 'company', capability: 'invoice:read' }, async ({ request, params }) => {
  const row = await getInvoice(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Invoice not found.')

  return replyWithEtag(request, invoiceDetailOut(row))
})

/**
 * Replaces a draft invoice's header and lines (send the whole document).
 * An issued or cancelled invoice is 409. The status in the body is ignored:
 * use POST /invoices/{id}/issue and /cancel.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'invoice:update', body: invoiceInputSchema },
  async ({ params, body, user }) => {
    must(await updateInvoice(actorOf(user), params.id, body))

    return saved(await invoiceDetailFor(params.id))
  },
)
