import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { orderDetailFor } from '@/lib/api/reads/detail'
import { orderDetailOut } from '@/lib/api/reads/mappers'
import { orderJsonSchema } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { getOrder } from '@/lib/queries/orders'
import { updateOrder } from '@/lib/services/orders'

export const GET = apiRoute({ auth: 'company', capability: 'order:read' }, async ({ request, params }) => {
  const row = await getOrder(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Order not found.')

  return replyWithEtag(request, orderDetailOut(row))
})

/**
 * Replaces the order's header, schedule and lines (send the whole document).
 * The status in the body is ignored: it never changes here (use POST /orders/{id}/status).
 * An invoiced, cancelled or dispatched order is 409.
 */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'order:update', body: orderJsonSchema },
  async ({ params, body, user }) => {
    must(await updateOrder(userActorOf(user), params.id, body))

    return saved(await orderDetailFor(params.id))
  },
)
