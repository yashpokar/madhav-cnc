import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { quotationListOut } from '@/lib/api/reads/mappers'
import { quotationsQuery } from '@/lib/api/schemas/reads'
import { quotationDetailFor } from '@/lib/api/reads/detail'
import { quotationWriteBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { listQuotations } from '@/lib/queries/quotations'
import { createQuotation } from '@/lib/services/quotations'

export const GET = apiRoute(
  { auth: 'company', capability: 'quotation:read', query: quotationsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listQuotations({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(quotationListOut), { meta })
  },
)

/** Creates a draft quotation: the lines are priced by the same code as the web form. */
export const POST = apiRoute(
  { auth: 'company', capability: 'quotation:create', body: quotationWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createQuotation(userActorOf(user), { ...body, status: 'DRAFT' }))

    return saved(await quotationDetailFor(created.id), 201)
  },
)
