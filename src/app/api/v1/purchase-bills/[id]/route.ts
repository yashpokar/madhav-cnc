import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { purchaseBillDetailFor } from '@/lib/api/reads/purchasing'
import { purchaseBillWriteBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { deletePurchaseBill, updatePurchaseBill } from '@/lib/services/purchase-bills'

export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request, params }) =>
  replyWithEtag(request, await purchaseBillDetailFor(params.id)),
)

/** Replaces a draft bill (send the whole document); a posted or cancelled bill is 409. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: purchaseBillWriteBody },
  async ({ params, body, user }) => {
    must(await updatePurchaseBill(actorOf(user), params.id, body))

    return saved(await purchaseBillDetailFor(params.id))
  },
)

/** Refused with 409 for a posted bill, or one with payments or receipts. */
export const DELETE = apiRoute({ auth: 'company', capability: 'purchase:delete' }, async ({ params }) => {
  must(await deletePurchaseBill(params.id))

  return reply({ id: params.id, deleted: true })
})
