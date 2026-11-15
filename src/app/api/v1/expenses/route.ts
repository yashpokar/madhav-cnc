import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { expenseListOut } from '@/lib/api/reads/mappers'
import { expensesQuery } from '@/lib/api/schemas/reads'
import { listExpenses } from '@/lib/queries/accounting'

export const GET = apiRoute(
  { auth: 'company', capability: 'expense:read', query: expensesQuery },
  async ({ query }) => {
    const { args, limit } = pageArgs(query)
    const rows = await listExpenses({
      search: query.q,
      categoryId: query.categoryId,
      from: query.from ? new Date(`${query.from}T00:00:00Z`) : undefined,
      to: query.to ? new Date(`${query.to}T00:00:00Z`) : undefined,
      page: args,
    })
    const { items, meta } = paged(rows, limit, (row) => at(row.expenseDate, row.id))

    return reply(items.map(expenseListOut), { meta })
  },
)
