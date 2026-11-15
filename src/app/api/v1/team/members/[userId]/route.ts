import { ApiError } from '@/lib/api/errors'
import { apiRoute, reply } from '@/lib/api/handler'
import { memberRoleBody } from '@/lib/api/schemas/account'
import { actorOf, must, saved } from '@/lib/api/writes'
import { changeMemberRoleFor, listTeamMembers, removeMemberFor } from '@/lib/services/team'

/** Changes the person's role in this company only. The last administrator cannot be demoted (409). */
export const PATCH = apiRoute(
  { auth: 'company', capability: 'user:update', body: memberRoleBody },
  async ({ params, body, user, companyId }) => {
    must(await changeMemberRoleFor(actorOf(user), companyId, params.userId, body.role))

    const member = (await listTeamMembers(companyId)).find((m) => m.id === params.userId)

    if (!member) throw new ApiError('NOT_FOUND', 'That person is not on this team.')

    return saved(member)
  },
)

/** Removes the person from this company (their account stays). The last administrator cannot be removed (409). */
export const DELETE = apiRoute({ auth: 'company', capability: 'user:update' }, async ({ params, user, companyId }) => {
  must(await removeMemberFor(actorOf(user), companyId, params.userId))

  return reply({ id: params.userId, removed: true })
})
