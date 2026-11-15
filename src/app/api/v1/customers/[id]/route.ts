import { ApiError } from '@/lib/api/errors'
import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { customerDetailOut } from '@/lib/api/reads/mappers'
import { can } from '@/lib/permissions'
import { customerAccount } from '@/lib/queries/payments'
import { getCustomer } from '@/lib/queries/customers'

export const GET = apiRoute({ auth: 'company', capability: 'customer:read' }, async ({ request, params, user }) => {
  const row = await getCustomer(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Customer not found.')
  // The balance needs the money role; a person who may only read customers gets none.
  const account = can(user.role, 'invoice:read') ? await customerAccount(row.id) : null

  return replyWithEtag(request, customerDetailOut(row, account))
})
