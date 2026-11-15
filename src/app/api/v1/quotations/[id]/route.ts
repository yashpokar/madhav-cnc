import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { quotationDetailOut } from '@/lib/api/reads/mappers'
import { getQuotation } from '@/lib/queries/quotations'

export const GET = apiRoute({ auth: 'company', capability: 'quotation:read' }, async ({ request, params }) => {
  const row = await getQuotation(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Quotation not found.')

  return replyWithEtag(request, quotationDetailOut(row))
})
