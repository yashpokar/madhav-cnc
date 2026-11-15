import { apiRoute, reply } from '@/lib/api/handler'
import { invitationOutFor } from '@/lib/api/reads/account'
import { invitationBody } from '@/lib/api/schemas/account'
import { actorOf, must, saved } from '@/lib/api/writes'
import { inviteFor, listInvitations } from '@/lib/services/team'

/** Pending (and just-lapsed) invitations, newest first, each with the link and the WhatsApp message to send. */
export const GET = apiRoute({ auth: 'company', capability: 'user:update' }, async ({ request, user, companyId }) => {
  const out = await invitationOutFor(request, user)

  return reply((await listInvitations(companyId)).map(out))
})

/** Creates a join link for a role. Capped per company (pending links, links an hour); a refusal is 409. */
export const POST = apiRoute(
  { auth: 'company', capability: 'user:update', body: invitationBody, idempotent: true },
  async ({ request, body, user, companyId }) => {
    const { invitation } = must(await inviteFor(actorOf(user), companyId, body))
    const out = await invitationOutFor(request, user)

    return saved(out({ ...invitation, status: 'PENDING' }), 201)
  },
)
