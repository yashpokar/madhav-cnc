import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { itemListOut } from '@/lib/api/reads/mappers'
import { itemsQuery } from '@/lib/api/schemas/reads'
import { listItems } from '@/lib/queries/items'

export const GET = apiRoute(
  { auth: 'company', capability: 'item:read', query: itemsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listItems({ search: query.q, type: query.type, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.name, row.id))

    return reply(items.map(itemListOut), { meta })
  },
)
