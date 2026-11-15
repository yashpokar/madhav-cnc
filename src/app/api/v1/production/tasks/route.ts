import { decodeCursor } from '@/lib/api/cursor'
import { apiRoute, reply } from '@/lib/api/handler'
import { paged } from '@/lib/api/reads/format'
import { productionTaskOut } from '@/lib/api/reads/mappers'
import { listTaskPage, positionOf } from '@/lib/api/reads/production'
import { productionTasksQuery } from '@/lib/api/schemas/reads'

export const GET = apiRoute(
  { auth: 'company', capability: 'production:read', query: productionTasksQuery },
  async ({ query }) => {
    const rows = await listTaskPage({
      search: query.q,
      status: query.status,
      limit: query.limit,
      after: query.cursor ? decodeCursor(query.cursor) : null,
    })
    const { items, meta } = paged(rows, query.limit, positionOf)

    return reply(items.map(productionTaskOut), { meta })
  },
)
