import { apiRoute } from '@/lib/api/handler'
import { purchaseBillDetailFor } from '@/lib/api/reads/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { duplicatePurchaseBill } from '@/lib/services/purchase-bills'

/** A new draft with the same lines, not tied to the order or the vendor's bill number (201, the copy). */
export const POST = apiRoute(
  { auth: 'company', capability: 'purchase:create', idempotent: true },
  async ({ params, user }) => {
    const result = must(await duplicatePurchaseBill(actorOf(user), params.id))

    return saved(await purchaseBillDetailFor(result.id), 201, { message: result.message })
  },
)
