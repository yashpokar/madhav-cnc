import { apiRoute, reply, replyWithEtag } from '@/lib/api/handler'
import { purchaseOrderDetailFor } from '@/lib/api/reads/purchasing'
import { purchaseOrderWriteBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { deletePurchaseOrder, updatePurchaseOrder } from '@/lib/services/purchase-orders'

export const GET = apiRoute({ auth: 'company', capability: 'purchase:read' }, async ({ request, params }) =>
  replyWithEtag(request, await purchaseOrderDetailFor(params.id)),
)

/** Replaces the order (send the whole document, lines included); one that is received or cancelled is 409. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: purchaseOrderWriteBody },
  async ({ params, body, user }) => {
    must(await updatePurchaseOrder(actorOf(user), params.id, body))

    return saved(await purchaseOrderDetailFor(params.id))
  },
)

/** Only a draft or cancelled order with no bills or receipts can be deleted (409 otherwise). */
export const DELETE = apiRoute({ auth: 'company', capability: 'purchase:delete' }, async ({ params }) => {
  must(await deletePurchaseOrder(params.id))

  return reply({ id: params.id, deleted: true })
})
