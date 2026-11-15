import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { orderDetailOut } from '@/lib/api/reads/mappers'
import { getOrder } from '@/lib/queries/orders'

export const GET = apiRoute({ auth: 'company', capability: 'order:read' }, async ({ request, params }) => {
  const row = await getOrder(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Order not found.')

  return replyWithEtag(request, orderDetailOut(row))
})
