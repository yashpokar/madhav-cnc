import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { partnerDetailFor, partnerListOut } from '@/lib/api/reads/master'
import { partnersQuery, partnerWriteBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { listPartners } from '@/lib/queries/partners'
import { createPartner } from '@/lib/services/partners'

/** Architects and carpenters, ordered by name. `includeInactive=true` adds the inactive ones. */
export const GET = apiRoute(
  { auth: 'company', capability: 'partner:read', query: partnersQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listPartners({
      search: query.q,
      type: query.type,
      includeInactive: query.includeInactive,
      page: args,
    })
    const { items, meta } = paged(rows, limit, (row) => at(row.name, row.id))

    return reply(items.map(partnerListOut), { meta })
  },
)

export const POST = apiRoute(
  { auth: 'company', capability: 'partner:create', body: partnerWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createPartner(actorOf(user), body))

    return saved(await partnerDetailFor(created.id), 201)
  },
)
