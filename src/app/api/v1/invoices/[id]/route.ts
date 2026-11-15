import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { invoiceDetailOut } from '@/lib/api/reads/mappers'
import { getInvoice } from '@/lib/queries/invoices'

export const GET = apiRoute({ auth: 'company', capability: 'invoice:read' }, async ({ request, params }) => {
  const row = await getInvoice(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Invoice not found.')

  return replyWithEtag(request, invoiceDetailOut(row))
})
