import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { invoiceListOut } from '@/lib/api/reads/mappers'
import { invoicesQuery } from '@/lib/api/schemas/reads'
import { listInvoices } from '@/lib/queries/invoices'

export const GET = apiRoute(
  { auth: 'company', capability: 'invoice:read', query: invoicesQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listInvoices({ search: query.q, status: query.status, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.createdAt, row.id))

    return reply(items.map(invoiceListOut), { meta })
  },
)
