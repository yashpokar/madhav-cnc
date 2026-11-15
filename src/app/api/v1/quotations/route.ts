import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { quotationListOut } from '@/lib/api/reads/mappers'
import { quotationsQuery } from '@/lib/api/schemas/reads'
import { listQuotations } from '@/lib/queries/quotations'

export const GET = apiRoute(
  { auth: 'company', capability: 'quotation:read', query: quotationsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listQuotations({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(quotationListOut), { meta })
  },
)
