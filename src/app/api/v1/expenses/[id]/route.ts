import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { expenseDetailFor } from '@/lib/api/reads/detail'
import { expenseDetailOut } from '@/lib/api/reads/mappers'
import { expenseWriteBody } from '@/lib/api/schemas/writes'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { getExpense } from '@/lib/queries/accounting'
import { deleteExpense, updateExpense } from '@/lib/services/expenses'

export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async ({ request, params }) => {
  const row = await getExpense(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Expense not found.')

  return replyWithEtag(request, expenseDetailOut(row))
})

/** Replaces the expense (send the whole record). Leaving out `receiptUploadId` keeps the receipt; null removes it. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'expense:update', body: expenseWriteBody },
  async ({ params, body, user }) => {
    const { methodId, details, ...rest } = body

    must(await updateExpense(userActorOf(user), params.id, { ...rest, channelId: methodId, paymentDetails: details }))

    return saved(await expenseDetailFor(params.id))
  },
)

export const DELETE = apiRoute({ auth: 'company', capability: 'expense:delete' }, async ({ params, user }) => {
  must(await deleteExpense(userActorOf(user), params.id))

  return reply({ id: params.id, deleted: true })
})
