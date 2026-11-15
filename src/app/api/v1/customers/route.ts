import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { customerListOut } from '@/lib/api/reads/mappers'
import { customersQuery } from '@/lib/api/schemas/reads'
import { listCustomers } from '@/lib/queries/customers'

export const GET = apiRoute(
  { auth: 'company', capability: 'customer:read', query: customersQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listCustomers({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(customerListOut), { meta })
  },
)
