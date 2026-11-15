import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { paymentDetailOut } from '@/lib/api/reads/mappers'
import { must, userActorOf } from '@/lib/api/writes'
import { getReceipt } from '@/lib/queries/payments'
import { deleteReceipt } from '@/lib/services/payments'

export const GET = apiRoute({ auth: 'company', capability: 'payment:read' }, async ({ request, params }) => {
  const row = await getReceipt(params.id)

  if (!row) throw new ApiError('NOT_FOUND', 'Payment not found.')

  return replyWithEtag(request, paymentDetailOut(row))
})

/** Deletes a receipt (its allocations go with it, so the invoices owe again). An order advance is 409. */
export const DELETE = apiRoute({ auth: 'company', capability: 'payment:delete' }, async ({ params, user }) => {
  must(await deleteReceipt(userActorOf(user), params.id))

  return reply({ id: params.id, deleted: true })
})
