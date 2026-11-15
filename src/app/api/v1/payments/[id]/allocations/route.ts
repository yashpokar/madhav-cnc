import { apiRoute } from '@/lib/api/handler'
import { paymentDetailFor } from '@/lib/api/reads/detail'
import { allocationsBody } from '@/lib/api/schemas/sales'
import { must, saved, userActorOf } from '@/lib/api/writes'
import { updateReceiptAllocations } from '@/lib/services/payments'

/** Replaces what the receipt settles: `allocations` per invoice and `openingApplied` for the opening balance. */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'payment:update', body: allocationsBody },
  async ({ params, body, user }) => {
    must(await updateReceiptAllocations(userActorOf(user), params.id, body.allocations, body.openingApplied))

    return saved(await paymentDetailFor(params.id))
  },
)
