import { apiRoute } from '@/lib/api/handler'
import { dispatchDetailFor } from '@/lib/api/reads/master'
import { dispatchStatusBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { setDispatchStatus } from '@/lib/services/dispatches'

/** Moves the challan along its status table (DRAFT, DISPATCHED, DELIVERED, CANCELLED); an illegal move is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'dispatch:update', body: dispatchStatusBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await setDispatchStatus(actorOf(user), params.id, body.status))

    return saved(await dispatchDetailFor(params.id))
  },
)
