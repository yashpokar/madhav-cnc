import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { orderListOut } from '@/lib/api/reads/mappers'
import { ordersQuery } from '@/lib/api/schemas/reads'
import { listOrders } from '@/lib/queries/orders'

export const GET = apiRoute(
  { auth: 'company', capability: 'order:read', query: ordersQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listOrders({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(orderListOut), { meta })
  },
)
