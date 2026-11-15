import { apiRoute, reply } from '@/lib/api/handler'
import { addMemberBody } from '@/lib/api/schemas/account'
import { actorOf, must } from '@/lib/api/writes'
import { addMemberFor, listTeamMembers } from '@/lib/services/team'

/** The people who can open this company (administrators only, as on the web). */
export const GET = apiRoute({ auth: 'company', capability: 'user:update' }, async ({ companyId }) =>
  reply(await listTeamMembers(companyId)),
)

/** Adds an existing account by exact email (409 when they are already on the team; 422 when the email is not valid). */
export const POST = apiRoute(
  { auth: 'company', capability: 'user:update', body: addMemberBody, idempotent: true },
  async ({ body, user, companyId }) => {
    must(await addMemberFor(actorOf(user), companyId, body.email, body.role))

    const member = (await listTeamMembers(companyId)).find((m) => m.email === body.email)

    return reply(member ?? null, { status: 201 })
  },
)
