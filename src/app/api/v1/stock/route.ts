import { apiRoute, reply } from '@/lib/api/handler'
import { pageInMemory, sortedBy, stockListOut } from '@/lib/api/reads/purchasing'
import { stockQuery } from '@/lib/api/schemas/purchasing'
import { listStock } from '@/lib/queries/stock'

/** Everything tracked for stock with on-hand, average cost and value, by name. `filter`: all, low, out or negative. */
export const GET = apiRoute({ auth: 'company', capability: 'stock:read', query: stockQuery }, async ({ query }) => {
  const rows = await listStock({ search: query.q, filter: query.filter })
  const key = (row: (typeof rows)[number]) => row.name.toLowerCase()
  const { items, meta } = pageInMemory(sortedBy(rows, key, 'asc'), query, key, 'asc')

  return reply(items.map(stockListOut), { meta })
})
