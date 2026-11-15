import { apiRoute } from '@/lib/api/handler'
import { invitationOutFor } from '@/lib/api/reads/account'
import { actorOf, must, saved } from '@/lib/api/writes'
import { regenerateInviteFor } from '@/lib/services/team'

/** A fresh link and expiry for an unused invitation (resend); the old link stops working. */
export const POST = apiRoute(
  { auth: 'company', capability: 'user:update', idempotent: true },
  async ({ request, params, user, companyId }) => {
    const { invitation } = must(await regenerateInviteFor(actorOf(user), companyId, params.id))
    const out = await invitationOutFor(request, user)

    return saved(out({ ...invitation, status: 'PENDING' }))
  },
)
