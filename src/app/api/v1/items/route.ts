import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { itemListOut } from '@/lib/api/reads/mappers'
import { itemDetailFor } from '@/lib/api/reads/master'
import { itemsQuery } from '@/lib/api/schemas/reads'
import { itemWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listItems } from '@/lib/queries/items'
import { createItem } from '@/lib/services/items'

export const GET = apiRoute(
  { auth: 'company', capability: 'item:read', query: itemsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listItems({ search: query.q, type: query.type, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.name, row.id))

    return reply(items.map(itemListOut), { meta })
  },
)

/** Adds an item to the catalogue (the code is assigned). A service is never stock-tracked. */
export const POST = apiRoute(
  { auth: 'company', capability: 'item:create', body: itemWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createItem(actorOf(user), body))

    return saved(await itemDetailFor(user, created.id), 201)
  },
)
