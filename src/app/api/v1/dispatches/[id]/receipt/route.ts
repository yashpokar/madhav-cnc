import { apiRoute } from '@/lib/api/handler'
import { dispatchDetailFor } from '@/lib/api/reads/master'
import { dispatchReceiptBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { recordReceipt } from '@/lib/services/dispatches'

/** Records who received the goods (marks the challan delivered when the web would). */
export const POST = apiRoute(
  { auth: 'company', capability: 'dispatch:update', body: dispatchReceiptBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await recordReceipt(actorOf(user), params.id, body.receivedByName))

    return saved(await dispatchDetailFor(params.id))
  },
)
