import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { orderListOut } from '@/lib/api/reads/mappers'
import { orderDetailFor } from '@/lib/api/reads/detail'
import { ordersQuery } from '@/lib/api/schemas/reads'
import { orderJsonSchema } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { listOrders } from '@/lib/queries/orders'
import { createOrder } from '@/lib/services/orders'

export const GET = apiRoute(
  { auth: 'company', capability: 'order:read', query: ordersQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listOrders({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(orderListOut), { meta })
  },
)

/** Creates an order (and its advance receipt when advanceAmount > 0 with advanceChannelId). */
export const POST = apiRoute(
  { auth: 'company', capability: 'order:create', body: orderJsonSchema, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createOrder(userActorOf(user), body))

    return saved(await orderDetailFor(created.id), 201)
  },
)
