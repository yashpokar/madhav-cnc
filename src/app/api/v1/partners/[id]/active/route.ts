import { apiRoute } from '@/lib/api/handler'
import { partnerDetailFor } from '@/lib/api/reads/master'
import { activeBody } from '@/lib/api/schemas/master'
import { actorOf, must, saved } from '@/lib/api/writes'
import { setPartnerActive } from '@/lib/services/partners'

/** Shows or hides a partner in the pickers; answers the partner. */
export const POST = apiRoute(
  { auth: 'company', capability: 'partner:update', body: activeBody, idempotent: true },
  async ({ params, body, user }) => {
    must(await setPartnerActive(actorOf(user), params.id, body.isActive))

    return saved(await partnerDetailFor(params.id))
  },
)
