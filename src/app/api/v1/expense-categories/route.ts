import { apiRoute } from '@/lib/api/handler'
import { expenseCategoryFor } from '@/lib/api/reads/master'
import { expenseCategoryWriteBody } from '@/lib/api/schemas/master'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { listExpenseCategories } from '@/lib/queries/accounting'
import { createExpenseCategory } from '@/lib/services/expenses'

export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async () => {
  const rows = await listExpenseCategories(true)

  return rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sortOrder }))
})

/** Adds an expense category (a name already used is 409). */
export const POST = apiRoute(
  { auth: 'company', capability: 'expense:create', body: expenseCategoryWriteBody, idempotent: true },
  async ({ body, user }) => {
    const created = must(await createExpenseCategory(userActorOf(user), body))

    return saved(await expenseCategoryFor(created.id), 201)
  },
)
