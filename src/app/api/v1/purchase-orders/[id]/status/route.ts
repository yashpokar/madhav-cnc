import { apiRoute } from '@/lib/api/handler'
import { purchaseOrderDetailFor } from '@/lib/api/reads/purchasing'
import { purchaseOrderStatusBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { setPurchaseOrderStatus } from '@/lib/services/purchase-orders'

/** Moves the order along its status table (an illegal move is 409); asking for its current status is a no-op. */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: purchaseOrderStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    const result = must(await setPurchaseOrderStatus(actorOf(user), params.id, body.status))

    return saved(await purchaseOrderDetailFor(params.id), 200, { message: result.message })
  },
)
