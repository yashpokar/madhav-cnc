import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { paymentListOut } from '@/lib/api/reads/mappers'
import { listPayments } from '@/lib/api/reads/payments'
import { paymentsQuery } from '@/lib/api/schemas/reads'

export const GET = apiRoute(
  { auth: 'company', capability: 'payment:read', query: paymentsQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listPayments({ search: query.q, mode: query.mode, from: query.from, to: query.to, page: args })
    const { items, meta } = paged(rows, limit, (row) => at(row.paidOn, row.id))

    return reply(items.map(paymentListOut), { meta })
  },
)
