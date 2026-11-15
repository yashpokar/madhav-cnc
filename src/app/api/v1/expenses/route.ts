import { apiRoute, reply } from '@/lib/api/handler'
import { at, pageArgs, paged } from '@/lib/api/reads/format'
import { expenseListOut } from '@/lib/api/reads/mappers'
import { expenseDetailFor } from '@/lib/api/reads/detail'
import { expensesQuery } from '@/lib/api/schemas/reads'
import { expenseWriteBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { listExpenses } from '@/lib/queries/accounting'
import { createExpense } from '@/lib/services/expenses'

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

/** Records an expense. `receiptUploadId` attaches a bill photo uploaded with POST /uploads (purpose expense_receipt). */
export const POST = apiRoute(
  { auth: 'company', capability: 'expense:create', body: expenseWriteBody, idempotent: true },
  async ({ body, user }) => {
    const { methodId, details, ...rest } = body
    const created = must(
      await createExpense(userActorOf(user), { ...rest, channelId: methodId, paymentDetails: details }),
    )

    return saved(await expenseDetailFor(created.id), 201)
  },
)
