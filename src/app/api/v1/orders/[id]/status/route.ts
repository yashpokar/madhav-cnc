import { apiRoute } from '@/lib/api/handler'
import { orderDetailFor } from '@/lib/api/reads/detail'
import { orderStatusBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { setOrderStatus } from '@/lib/services/orders'

/** Moves the order along its status table; entering IN_PRODUCTION creates its stage tasks. An illegal move is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'order:update', body: orderStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await setOrderStatus(userActorOf(user), params.id, body.status))

    return saved(await orderDetailFor(params.id))
  },
)
