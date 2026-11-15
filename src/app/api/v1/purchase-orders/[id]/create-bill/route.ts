import { apiRoute } from '@/lib/api/handler'
import { purchaseBillDetailFor } from '@/lib/api/reads/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { createBillFromOrder } from '@/lib/services/purchase-orders'

/** Copies the order's lines into a new draft bill linked back to it (201, the bill). A cancelled order is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:create', idempotent: true },
  async ({ params, user }) => {
    const result = must(await createBillFromOrder(actorOf(user), params.id))

    return saved(await purchaseBillDetailFor(result.id), 201, { message: result.message })
  },
)
