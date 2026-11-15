import { apiRoute } from '@/lib/api/handler'
import { orderDetailFor } from '@/lib/api/reads/detail'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { convertQuotationToOrder } from '@/lib/services/orders'

/** Turns an accepted quotation into a confirmed order (201, the new order). */
export const POST = apiRoute(
  { auth: 'company', capability: 'order:create', idempotent: true },
  async ({ params, user }) => {
    const created = must(await convertQuotationToOrder(userActorOf(user), params.id))

    return saved(await orderDetailFor(created.id), 201)
  },
)
