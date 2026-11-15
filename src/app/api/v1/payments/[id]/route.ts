import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { paymentDetailOut } from '@/lib/api/reads/mappers'
import { getReceipt } from '@/lib/queries/payments'

export const GET = apiRoute({ auth: 'company', capability: 'payment:read' }, async ({ request, params }) => {
  const row = await getReceipt(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Payment not found.')

  return replyWithEtag(request, paymentDetailOut(row))
})
