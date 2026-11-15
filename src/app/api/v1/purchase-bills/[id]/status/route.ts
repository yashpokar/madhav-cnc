import { requireApiCapability } from '@/lib/api/auth'
import { apiRoute } from '@/lib/api/handler'
import { purchaseBillDetailFor } from '@/lib/api/reads/purchasing'
import { purchaseBillStatusBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { setPurchaseBillStatus } from '@/lib/services/purchase-bills'

/**
 * Draft, posted or cancelled (an illegal move is 409; a bill with payments
 * cannot leave POSTED). Posting adds the goods to stock only with
 * `receiveNow: true`, which also needs stock:create, as on the web.
 */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:update', body: purchaseBillStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    if (body.receiveNow && body.status === 'POSTED') requireApiCapability(user, 'stock:create')

    const result = must(await setPurchaseBillStatus(actorOf(user), params.id, body.status, { receiveNow: body.receiveNow }))

    return saved(await purchaseBillDetailFor(params.id), 200, { message: result.message })
  },
)
