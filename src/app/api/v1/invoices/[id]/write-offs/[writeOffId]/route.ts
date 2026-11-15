import { apiRoute } from '@/lib/api/handler'
import { invoiceDetailFor } from '@/lib/api/reads/detail'
import { requireWriteOff } from '@/lib/api/sales-helpers'
import { actorOf, must, saved } from '@/lib/api/writes'
import { removeWriteOff } from '@/lib/services/invoices'

/** Reverses a write-off. Answers the invoice. */
export const DELETE = apiRoute({ auth: 'company', capability: 'payment:update' }, async ({ params, user }) => {
  await requireWriteOff(params.id, params.writeOffId)
  must(await removeWriteOff(actorOf(user), params.writeOffId))

  return saved(await invoiceDetailFor(params.id))
})
