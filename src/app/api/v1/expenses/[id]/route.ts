import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { expenseDetailOut } from '@/lib/api/reads/mappers'
import { getExpense } from '@/lib/queries/accounting'

export const GET = apiRoute({ auth: 'company', capability: 'expense:read' }, async ({ request, params }) => {
  const row = await getExpense(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Expense not found.')

  return replyWithEtag(request, expenseDetailOut(row))
})
