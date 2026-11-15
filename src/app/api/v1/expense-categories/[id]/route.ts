import { apiRoute, parseWith, reply } from '@/lib/api/handler'
import { expenseCategoryFor } from '@/lib/api/reads/master'
import { expenseCategoryPatchBody } from '@/lib/api/schemas/master'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { deleteExpenseCategory, updateExpenseCategory } from '@/lib/services/expenses'
import { expenseCategorySchema } from '@/lib/validation/accounting'

/** Only the fields sent change (name, sortOrder, isActive). */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'expense:update', body: expenseCategoryPatchBody },
  async ({ params, body, user }) => {
    const current = await expenseCategoryFor(params.id)
    const data = parseWith(
      expenseCategorySchema,
      { name: current.name, sortOrder: current.sortOrder, isActive: current.isActive, ...body },
      'expense category',
    )

    must(await updateExpenseCategory(userActorOf(user), params.id, data))

    return saved(await expenseCategoryFor(params.id))
  },
)

/** Refused with 409 while expenses use it: mark it inactive instead. */
export const DELETE = apiRoute({ auth: 'company', capability: 'expense:delete' }, async ({ params, user }) => {
  must(await deleteExpenseCategory(userActorOf(user), params.id))

  return reply({ id: params.id, deleted: true })
})
